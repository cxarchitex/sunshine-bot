import jwt from "jsonwebtoken";

export default function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  try {
    const appId = process.env.SUNSHINE_APP_ID;
    const appSecret = process.env.SUNSHINE_APP_SECRET;

    if (!appId || !appSecret) {
      return res.status(500).json({ error: "Missing Sunshine env vars" });
    }

    const payload = {
      scope: "app",
      appId: appId,
      userId: "shopify-anon-user"
    };

    const token = jwt.sign(payload, appSecret, {
      algorithm: "HS256",
      expiresIn: "1h"
    });

    return res.status(200).json({ jwt: token });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
