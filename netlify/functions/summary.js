const { google } = require("googleapis");

function getTokenFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/gtoken=([^;]+)/);
  if (!match) return null;
  return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
}

exports.handler = async (event) => {
  const tokens = getTokenFromCookie(event.headers.cookie);
  if (!tokens) return { statusCode: 401, body: JSON.stringify({ error: "Non authentifié" }) };

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
  );
  oauth2Client.setCredentials(tokens);

  try {
    // Récupère les emails non lus
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const list = await gmail.users.messages.list({
      userId: "me", labelIds: ["UNREAD", "INBOX"], maxResults: 10,
    });
    const emails = await Promise.all((list.data.messages || []).map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: "me", id: msg.id, format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });
      const headers = detail.data.payload.headers;
      const get = (n) => headers.find((h) => h.name === n)?.value || "";
      return { from: get("From"), subject: get("Subject"), snippet: detail.data.snippet };
    }));

    // Récupère les événements du jour
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const now = new Date();
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59);
    const result = await calendar.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: endOfDay.toISOString(),
      singleEvents: true, orderBy: "startTime", maxResults: 20,
    });
    const events = (result.data.items || []).map((e) => ({
      title: e.summary,
      start: e.start.dateTime || e.start.date,
      end: e.end.dateTime || e.end.date,
      attendees: (e.attendees || []).length,
      meetLink: e.hangoutLink || null,
    }));

    // Récupère les todos depuis le body de la requête
    let todos = [];
    if (event.body) {
      try { todos = JSON.parse(event.body).todos || []; } catch {}
    }
    const pendingTodos = todos.filter(t => !t.done);

    // Prépare le prompt pour Gemini
    const today = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const todoList = pendingTodos.length > 0 
      ? pendingTodos.map(t => `• ${t.text}`).join("\n") 
      : "Aucune tâche";
    const prompt = `Résumé de journée en français pour ${today}. Maximum 250 mots. Réponds OBLIGATOIREMENT avec ces 4 sections :

## 📧 Emails prioritaires
${emails.slice(0, 5).map((e, i) => `${i+1}. ${e.from.split('<')[0].trim()} — ${e.subject}`).join("\n")}

## 📅 Planning du jour
${events.map(e => `• ${e.title} à ${new Date(e.start).toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"})}`).join("\n") || "• Aucun meeting"}

## ✅ To-dos du jour
${todoList}

## 🎯 Top 3 priorités
Suggère 3 actions basées sur les emails, meetings et to-dos ci-dessus.

IMPORTANT : Inclus TOUTES les sections, notamment les to-dos listés ci-dessus.`;

    // Appel Gemini API
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1000 }
        })
      }
    );

    const geminiData = await geminiRes.json();
    console.log("Gemini response:", JSON.stringify(geminiData));
    const summary = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 
      geminiData.error?.message || 
      "Impossible de générer le résumé.";

    return { statusCode: 200, body: JSON.stringify({ summary, emailCount: emails.length, eventCount: events.length, todoCount: pendingTodos.length }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};