import jwt from "jsonwebtoken";

export default function handler(req, res) {
  // 🔑 CORS HEADERS (THIS IS WHAT YOU WERE MISSING)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const token = jwt.sign(
      {
        scope: "app",
      },
      process.env.SUNSHINE_APP_SECRET,
      {
        issuer: process.env.SUNSHINE_APP_ID,
        expiresIn: "1h",
      }
    );

    res.status(200).json({ jwt: token });
  } catch (error) {
    console.error("JWT error", error);
    res.status(500).json({ error: "Failed to generate JWT" });
  }
}
