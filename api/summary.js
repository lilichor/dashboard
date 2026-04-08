const { google } = require("googleapis");

function getTokenFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/gtoken=([^;]+)/);
  if (!match) return null;
  return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
}

module.exports = async (req, res) => {
  const tokens = getTokenFromCookie(req.headers.cookie);
  if (!tokens) return res.status(401).json({ error: "Non authentifié" });

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
  );
  oauth2Client.setCredentials(tokens);

  let todos = [];
  if (req.body) {
    try { todos = req.body.todos || []; } catch {}
  }
  const pendingTodos = todos.filter(t => !t.done);

  try {
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const list = await gmail.users.messages.list({ userId: "me", labelIds: ["UNREAD", "INBOX"], maxResults: 10 });
    const emails = await Promise.all((list.data.messages || []).map(async (msg) => {
      const detail = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "metadata", metadataHeaders: ["From", "Subject"] });
      const headers = detail.data.payload.headers;
      const get = (n) => headers.find((h) => h.name === n)?.value || "";
      return { from: get("From"), subject: get("Subject"), snippet: detail.data.snippet };
    }));

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const now = new Date();
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59);
    const result = await calendar.events.list({
      calendarId: "primary", timeMin: now.toISOString(), timeMax: endOfDay.toISOString(),
      singleEvents: true, orderBy: "startTime", maxResults: 20,
    });
    const events = (result.data.items || []).map((e) => ({
      title: e.summary, start: e.start.dateTime || e.start.date, end: e.end.dateTime || e.end.date,
      attendees: (e.attendees || []).length, meetLink: e.hangoutLink || null,
    }));

    const today = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
    const todoList = pendingTodos.length > 0 ? pendingTodos.map(t => `• ${t.text}`).join("\n") : "Aucune tâche";
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

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } }
        })
      }
    );

    const geminiData = await geminiRes.json();
    const summary = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || geminiData.error?.message || "Impossible de générer le résumé.";
    res.json({ summary, emailCount: emails.length, eventCount: events.length, todoCount: pendingTodos.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};