import jwt from "jsonwebtoken";

export default function handler(req, res) {
  // ----- CORS -----
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // ----- ENV CHECK -----
  const appId = process.env.SUNSHINE_APP_ID;
  const appSecret = process.env.SUNSHINE_APP_SECRET;

  if (!appId || !appSecret) {
    console.error("Missing Sunshine env vars", { appId, appSecret });
    return res.status(500).json({ error: "Sunshine env vars missing" });
  }

  try {
    const token = jwt.sign(
      {
        scope: "app",
        appId: appId
      },
      appSecret,
      { expiresIn: "1h" }
    );

    return res.status(200).json({ jwt: token });
  } catch (err) {
    console.error("JWT signing failed", err);
    return res.status(500).json({ error: "JWT signing failed" });
  }
}
