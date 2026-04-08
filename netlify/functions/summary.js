const { google } = require("googleapis");

function getTokenFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/gtoken=([^;]+)/);
  if (!match) return null;
  return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
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
    const prompt = `Tu es un assistant de productivité. Génère un résumé de journée en français pour ${today}.

EMAILS NON LUS (${emails.length}) :
${emails.map(e => `- De: ${e.from}\n  Objet: ${e.subject}\n  Aperçu: ${e.snippet}`).join("\n")}

MEETINGS AUJOURD'HUI (${events.length}) :
${events.map(e => {
  const start = new Date(e.start);
  return `- ${e.title} à ${start.toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"})} (${e.attendees} participants)${e.meetLink ? " 🎥" : ""}`;
}).join("\n")}

TO-DO EN ATTENTE (${pendingTodos.length}) :
${pendingTodos.length > 0 ? pendingTodos.map(t => `- ${t.text}`).join("\n") : "Aucune tâche en attente"}

Génère un résumé structuré avec :
1. 📧 **Emails prioritaires** — identifie les 3 emails les plus importants à traiter
2. 📅 **Planning du jour** — liste les meetings avec l'heure
3. ✅ **Mes to-dos** — reprend les tâches en attente et suggère un ordre de priorité
4. 🎯 **Mes priorités** — suggère 3 actions concrètes pour être productif aujourd'hui
5. 💡 **Conseil du jour** — un conseil court et motivant

Sois concis, professionnel et actionnable. Utilise des emojis et du markdown.`;

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

    return { statusCode: 200, body: JSON.stringify({ summary, emailCount: emails.length, eventCount: events.length }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};