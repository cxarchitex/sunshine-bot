import fetch from "node-fetch";

const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const SHOPIFY_API_VERSION = "2024-01";

// In-memory session store (OK for demo / Vercel edge)
const sessions = new Map();

function getSession(conversationId) {
  if (!sessions.has(conversationId)) {
    sessions.set(conversationId, {
      intent: null,
      awaiting: null,
      email: null,
      orderNumber: null
    });
  }
  return sessions.get(conversationId);
}

async function shopifyFetch(path) {
  const res = await fetch(
    `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/${path}`,
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN,
        "Content-Type": "application/json"
      }
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { message, conversationId } = req.body;
    const text = message.toLowerCase();
    const session = getSession(conversationId);

    /* ---------------- INTENT DETECTION ---------------- */

    if (/list.*order|my orders|show orders/.test(text)) {
      session.intent = "LIST_ORDERS";
      session.awaiting = "EMAIL";
      sessions.set(conversationId, session);

      return res.json({
        reply: "Please share the email used for your orders."
      });
    }

    if (/track.*order|where.*order/.test(text)) {
      session.intent = "TRACK_ORDER";
      session.awaiting = "ORDER_NUMBER";
      sessions.set(conversationId, session);

      return res.json({
        reply: "Please share your order number."
      });
    }

    /* ---------------- EMAIL HANDLING ---------------- */

    const emailMatch = message.match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    );

    if (emailMatch && session.intent === "LIST_ORDERS") {
      session.email = emailMatch[0];
      session.awaiting = null;
      sessions.set(conversationId, session);

      const data = await shopifyFetch(
        `orders.json?email=${encodeURIComponent(
          session.email
        )}&status=any&limit=5`
      );

      if (!data.orders.length) {
        return res.json({
          reply: "I couldn’t find any orders for this email."
        });
      }

      const summary = data.orders
        .map(
          (o) =>
            `• #${o.order_number} – ${o.financial_status}, ${
              o.fulfillment_status || "unfulfilled"
            }`
        )
        .join("\n");

      return res.json({
        reply: `Here are your recent orders:\n${summary}`
      });
    }

    /* ---------------- ORDER NUMBER HANDLING ---------------- */

    const orderNumberMatch = message.match(/#?\d{3,}/);

    if (orderNumberMatch && session.intent === "TRACK_ORDER") {
      const orderNumber = orderNumberMatch[0].replace("#", "");
      session.orderNumber = orderNumber;
      session.awaiting = null;
      sessions.set(conversationId, session);

      const data = await shopifyFetch(
        `orders.json?name=%23${orderNumber}&status=any`
      );

      if (!data.orders.length) {
        return res.json({
          reply: "I couldn’t find an order with that number."
        });
      }

      const order = data.orders[0];

      return res.json({
        reply: `Order #${order.order_number}\nPayment: ${
          order.financial_status
        }\nFulfillment: ${
          order.fulfillment_status || "unfulfilled"
        }`
      });
    }

    /* ---------------- FALLBACK ---------------- */

    return res.json({
      reply:
        "Hi 👋 I can help with tracking orders, listing orders, or checking products."
    });
  } catch (err) {
    console.error("Chat error:", err);
    return res.status(500).json({
      reply: "Something went wrong while checking your order."
    });
  }
}
