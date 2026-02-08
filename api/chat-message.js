// api/chat-message.js

export default async function handler(req, res) {
  // ---- CORS (required for Shopify storefront) ----
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message, conversationId, customer } = req.body;

    if (!conversationId || !message) {
      return res.status(400).json({ reply: "Invalid request." });
    }

    // ---- Session store (replace with Redis later) ----
    const session = sessions.get(conversationId) || {};

    // ---- Logged-in customer detection ----
    if (customer?.email) {
      session.email = customer.email;
      session.customerId = customer.id;
    }

    // ---- Extract email if user typed it ----
    const extractedEmail = extractEmail(message);
    if (extractedEmail) {
      session.email = extractedEmail;
    }

    // ---- Detect intent only when explicitly stated ----
    const detectedIntent = detectIntent(message);
    if (detectedIntent !== "UNKNOWN") {
      session.intent = detectedIntent;
    }

    sessions.set(conversationId, session);

    // ---- Identity gate (NO LOOPING) ----
    const needsIdentity =
      session.intent === "LIST_ORDERS" ||
      session.intent === "TRACK_ORDER";

    if (needsIdentity && !session.email) {
      return res.json({
        reply: "Please share the email used for your orders."
      });
    }

    // ---- Handle intents ----
    if (session.intent === "LIST_ORDERS") {
      const orders = await fetchOrdersByEmail(session.email);

      if (!orders.length) {
        return res.json({
          reply: "I couldn’t find any orders for that email."
        });
      }

      const reply = orders
        .slice(0, 5)
        .map(o => {
          return `#${o.order_number}
Payment: ${o.financial_status}
Fulfillment: ${o.fulfillment_status || "unfulfilled"}`;
        })
        .join("\n\n");

      return res.json({ reply });
    }

    if (session.intent === "TRACK_ORDER") {
      const orderNumber = extractOrderNumber(message);

      if (!orderNumber) {
        return res.json({
          reply: "Please share your order number. Example: #1042"
        });
      }

      const order = await fetchOrderByNumber(orderNumber);

      if (!order) {
        return res.json({
          reply: "I couldn’t find that order."
        });
      }

      return res.json({
        reply: `Order #${order.order_number}
Payment: ${order.financial_status}
Fulfillment: ${order.fulfillment_status || "unfulfilled"}`
      });
    }

    // ---- Default fallback (only once) ----
    return res.json({
      reply:
        "I can help with tracking orders, listing orders, or checking products."
    });

  } catch (err) {
    console.error("Chat error:", err);
    return res.status(500).json({
      reply: "Sorry, something went wrong."
    });
  }
}

/* ---------------- HELPERS ---------------- */

const sessions = new Map();

function detectIntent(text) {
  const t = text.toLowerCase();

  if (t.includes("track")) return "TRACK_ORDER";
  if (t.includes("list")) return "LIST_ORDERS";
  if (t.includes("my orders")) return "LIST_ORDERS";

  return "UNKNOWN";
}

function extractEmail(text) {
  const match = text.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
  );
  return match ? match[0] : null;
}

function extractOrderNumber(text) {
  const match = text.match(/#?\d{3,}/);
  return match ? match[0].replace("#", "") : null;
}

/* ---------------- SHOPIFY ---------------- */

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

async function fetchOrdersByEmail(email) {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/2023-10/orders.json?email=${encodeURIComponent(
    email
  )}&status=any`;

  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN
    }
  });

  const data = await res.json();
  return data.orders || [];
}

async function fetchOrderByNumber(orderNumber) {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/2023-10/orders.json?name=%23${orderNumber}&status=any`;

  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN
    }
  });

  const data = await res.json();
  return data.orders?.[0] || null;
}
