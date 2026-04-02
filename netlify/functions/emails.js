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
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const list = await gmail.users.messages.list({
      userId: "me",
      labelIds: ["UNREAD", "INBOX"],
      maxResults: 10,
    });

    const messages = await Promise.all(
      (list.data.messages || []).map(async (msg) => {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: msg.id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });
        const headers = detail.data.payload.headers;
        const get = (n) => headers.find((h) => h.name === n)?.value || "";
        return {
          from: get("From"),
          subject: get("Subject"),
          date: get("Date"),
          snippet: detail.data.snippet,
        };
      })
    );

    return { statusCode: 200, body: JSON.stringify(messages) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};