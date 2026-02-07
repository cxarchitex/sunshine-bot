import jwt from "jsonwebtoken";

export default function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const appId = process.env.SUNSHINE_APP_ID;
  const keyId = process.env.SUNSHINE_KEY_ID;
  const secret = process.env.SUNSHINE_SECRET;

  if (!appId || !keyId || !secret) {
    return res.status(500).json({
      error: "Missing Sunshine env vars",
      appIdPresent: !!appId,
      keyIdPresent: !!keyId,
      secretPresent: !!secret
    });
  }

  const payload = {
    scope: "app",
    appId,
    userId: "anon_" + Date.now()
  };

  const token = jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: "1h",
    header: {
      kid: keyId
    }
  });

  return res.status(200).json({ jwt: token });
}
