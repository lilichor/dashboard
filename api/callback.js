const { google } = require("googleapis");

module.exports = async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Missing code");

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
  );

  const { tokens } = await oauth2Client.getToken(code);
  const tokenStr = JSON.stringify(tokens);
  const encoded = Buffer.from(tokenStr).toString("base64");

  res.setHeader("Set-Cookie", `gtoken=${encoded}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`);
  res.redirect("/");
};