const { getStore } = require("@netlify/blobs");

function getUserId(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/gtoken=([^;]+)/);
  if (!match) return null;
  try {
    const token = JSON.parse(Buffer.from(match[1], "base64").toString("utf8"));
    // Utilise le token d'accès comme identifiant unique
    return require("crypto").createHash("md5").update(token.access_token || match[1]).digest("hex");
  } catch { return null; }
}

exports.handler = async (event) => {
  const userId = getUserId(event.headers.cookie);
  if (!userId) return { statusCode: 401, body: JSON.stringify({ error: "Non authentifié" }) };

  const store = getStore({ name: "dashboard-data", consistency: "strong" });
  const key = `user-${userId}`;

  // GET — récupère les données
  if (event.httpMethod === "GET") {
    try {
      const raw = await store.get(key);
      if (!raw) return { statusCode: 200, body: JSON.stringify({ todos: [], colleagues: [], reports: [], alerts: [] }) };
      return { statusCode: 200, body: raw };
    } catch (e) {
      return { statusCode: 200, body: JSON.stringify({ todos: [], colleagues: [], reports: [], alerts: [] }) };
    }
  }

  // POST — sauvegarde les données
  if (event.httpMethod === "POST") {
    try {
      const data = JSON.parse(event.body);
      await store.set(key, JSON.stringify(data));
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (e) {
      return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, body: "Method Not Allowed" };
};