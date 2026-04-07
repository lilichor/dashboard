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
    const calendar = google.calendar({ version: "v3", auth: oauth2Client });
    const now = new Date();
    const inWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const result = await calendar.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: inWeek.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 20,
    });

    const events = (result.data.items || []).map((e) => {
      const meetLink =
        e.hangoutLink ||
        e.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri ||
        null;

      const attendees = (e.attendees || []).map((a) => ({
        name: a.displayName || a.email,
        email: a.email,
        status: a.responseStatus,
      }));

      return {
        id: e.id,
        title: e.summary || "(Sans titre)",
        start: e.start.dateTime || e.start.date,
        end: e.end.dateTime || e.end.date,
        location: e.location || null,
        description: e.description || null,
        meetLink,
        attendees,
        calendarUrl: e.htmlLink || null,
      };
    });

    return { statusCode: 200, body: JSON.stringify(events) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};