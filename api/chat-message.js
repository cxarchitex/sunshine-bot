const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const SHOPIFY_API_VERSION = "2024-01";

const sessions = new Map();

function getSession(conversationId) {
  if (!sessions.has(conversationId)) {
    sessions.set(conversationId, {
      intent: null,
      email: null
    });
  }
  return sessions.get(conversationId);
}

async function shopifyFetch(path) {
  const res = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/${path}`,
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
  /* ---------------- CORS ---------------- */
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
    const { message, conversationId } = req.body;
    const text = message.toLowerCase();
    const session = getSession(conversationId);

    /* -------- LIST ORDERS -------- */
    if (/list.*order|my orders/.test(text)) {
      session.intent = "LIST_ORDERS";
      return res.json({
        reply: "Please share the email used for your orders."
      });
    }

    /* -------- TRACK ORDER -------- */
    if (/track.*order|where.*order/.test(text)) {
      session.intent = "TRACK_ORDER";
      return res.json({
        reply: "Please share your order number."
      });
    }

    /* -------- EMAIL -------- */
    const emailMatch = message.match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    );

    if (emailMatch && session.intent === "LIST_ORDERS") {
      session.email = emailMatch[0];

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

      const orders = data.orders
        .map(
          (o) =>
            `• #${o.order_number} – ${o.financial_status}, ${
              o.fulfillment_status || "unfulfilled"
            }`
        )
        .join("\n");

      return res.json({
        reply: `Here are your recent orders:\n${orders}`
      });
    }

    /* -------- ORDER NUMBER -------- */
    const orderMatch = message.match(/#?\d{3,}/);

    if (orderMatch && session.intent === "TRACK_ORDER") {
      const number = orderMatch[0].replace("#", "");

      const data = await shopifyFetch(
        `orders.json?name=%23${number}&status=any`
      );

      if (!data.orders.length) {
        return res.json({
          reply: "I couldn’t find an order with that number."
        });
      }

      const o = data.orders[0];

      return res.json({
        reply: `Order #${o.order_number}\nPayment: ${o.financial_status}\nFulfillment: ${
          o.fulfillment_status || "unfulfilled"
        }`
      });
    }

    /* -------- FALLBACK -------- */
    return res.json({
      reply:
        "Hi 👋 I can help with tracking orders, listing orders, or checking products."
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      reply: "Sorry, something went wrong."
    });
  }
}
