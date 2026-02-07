import jwt from "jsonwebtoken";

export default function handler(req, res) {
  // ✅ CORS HEADERS (THIS IS WHAT YOU ARE MISSING)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const token = jwt.sign(
      {
        scope: "app",
        userId: "shopify-anon-user"
      },
      process.env.SUNSHINE_APP_SECRET,
      {
        issuer: process.env.SUNSHINE_APP_ID,
        expiresIn: "1h"
      }
    );

    return res.status(200).json({ jwt: token });
  } catch (err) {
    console.error("JWT error:", err);
    return res.status(500).json({ error: "JWT generation failed" });
  }
}
