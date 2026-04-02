const { google } = require("googleapis");

exports.handler = async (event) => {
  const code = event.queryStringParameters?.code;
  if (!code) return { statusCode: 400, body: "Missing code" };

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
  );

  const { tokens } = await oauth2Client.getToken(code);

  // On stocke le token dans un cookie sécurisé
  const tokenStr = JSON.stringify(tokens);
  const encoded = Buffer.from(tokenStr).toString("base64");

  return {
    statusCode: 302,
    headers: {
      Location: "/",
      "Set-Cookie": `gtoken=${encoded}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`,
    },
    body: "",
  };
};