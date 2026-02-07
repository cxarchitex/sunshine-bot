import jwt from "jsonwebtoken";

export default function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const appId = process.env.SUNSHINE_APP_ID;
  const appSecret = process.env.SUNSHINE_APP_SECRET;

  if (!appId || !appSecret) {
    return res.status(500).json({ error: "Sunshine env vars missing" });
  }

  const payload = {
    scope: "app",
    appId,
    exp: Math.floor(Date.now() / 1000) + 60 * 5
  };

  const token = jwt.sign(payload, appSecret);

  res.status(200).json({ jwt: token });
}
