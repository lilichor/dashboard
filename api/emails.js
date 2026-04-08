const { google } = require("googleapis");

function getTokenFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/gtoken=([^;]+)/);
  if (!match) return null;
  return JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
}

function decodeBody(payload) {
  if (!payload) return "";
  if (payload.body?.data) return Buffer.from(payload.body.data, "base64").toString("utf8");
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) return Buffer.from(part.body.data, "base64").toString("utf8");
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) return Buffer.from(part.body.data, "base64").toString("utf8");
      if (part.parts) { const nested = decodeBody(part); if (nested) return nested; }
    }
  }
  return "";
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

  try {
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const list = await gmail.users.messages.list({ userId: "me", labelIds: ["UNREAD", "INBOX"], maxResults: 10 });
    const messages = await Promise.all((list.data.messages || []).map(async (msg) => {
      const detail = await gmail.users.messages.get({ userId: "me", id: msg.id, format: "full" });
      const headers = detail.data.payload.headers;
      const get = (n) => headers.find((h) => h.name === n)?.value || "";
      const body = decodeBody(detail.data.payload);
      return { id: msg.id, from: get("From"), subject: get("Subject"), date: get("Date"), snippet: detail.data.snippet, body: body.slice(0, 3000), gmailUrl: `https://mail.google.com/mail/u/0/#inbox/${msg.id}` };
    }));
    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};