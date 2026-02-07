import jwt from "jsonwebtoken";

export default function handler(req, res) {
  const appId = process.env.SUNSHINE_APP_ID;
  const keyId = process.env.SUNSHINE_KEY_ID;
  const secret = process.env.SUNSHINE_SECRET;

  if (!appId || !keyId || !secret) {
    return res.status(500).json({ error: "Missing Sunshine env vars" });
  }

  const payload = {
    scope: "app",
    appId: appId,
    userId: "anon_" + Date.now()
  };

  const token = jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: "1h",
    header: {
      kid: keyId
    }
  });

  res.status(200).json({ jwt: token });
}
