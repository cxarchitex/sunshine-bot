export default async function handler(req, res) {
  /* --------------------
     CORS
  -------------------- */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  /* --------------------
     Session memory (in-memory)
     Note: fine for demo / POC
  -------------------- */
  global.sessions ||= {};
  const { message, conversationId } = req.body;

  if (!conversationId || !message) {
    return res.status(400).json({ reply: "Invalid request." });
  }

  const session =
    global.sessions[conversationId] ||= {
      intent: null,
      email: null
    };

  const text = message.toLowerCase();

  /* --------------------
     INTENT DETECTION
  -------------------- */
  const isTrackIntent =
    /track|where.*order|order status|my order/.test(text);

  const emailMatch = message.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
  );

  /* --------------------
     STEP 1: Detect intent
  -------------------- */
  if (isTrackIntent && !session.intent) {
    session.intent = "TRACK_ORDER";
  }

  /* --------------------
     STEP 2: Capture email
  -------------------- */
  if (emailMatch) {
    session.email = emailMatch[0];
  }

  /* --------------------
     STEP 3: Handle TRACK ORDER
  -------------------- */
  if (session.intent === "TRACK_ORDER") {
    if (!session.email) {
      return res.json({
        reply: "Please share the email used for your order."
      });
    }

    try {
      const orders = await fetchOrdersByEmail(session.email);

      if (!orders.length) {
        return res.json({
          reply:
            "I couldn’t find any orders with that email. Please double-check it."
        });
      }

      const activeOrder = orders.find(
        (o) =>
          o.financial_status !== "refunded" &&
          o.fulfillment_status !== "fulfilled" &&
          o.cancelled_at === null
      );

      if (!activeOrder) {
        return res.json({
          reply:
            "You don’t have any active orders right now. Would you like to see your past orders?"
        });
      }

      const status =
        activeOrder.fulfillment_status || activeOrder.financial_status;

      const eta =
        activeOrder.fulfillments?.[0]?.estimated_delivery_at ||
        "soon";

      return res.json({
        reply: `Your order #${activeOrder.name} is currently **${status}**. Expected delivery: **${eta}**.`
      });
    } catch (err) {
      console.error("Order fetch error:", err);
      return res.json({
        reply: "Sorry, I couldn’t fetch your order right now."
      });
    }
  }

  /* --------------------
     DEFAULT FALLBACK
  -------------------- */
  return res.json({
    reply:
      "Hi 👋 I can help with tracking orders, listing orders, or checking products."
  });
}

/* ==========================
   SHOPIFY API HELPERS
========================== */

async function fetchOrdersByEmail(email) {
  const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
  const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
  const VERSION = "2024-01";

  const url = `https://${SHOP}/admin/api/${VERSION}/orders.json?email=${encodeURIComponent(
    email
  )}&status=any&limit=10`;

  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error("Shopify API error");
  }

  const data = await res.json();
  return data.orders || [];
}
