export default async function handler(req, res) {
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
    if (!message || !conversationId) {
      return res.status(400).json({ reply: "Invalid request." });
    }

    const session = sessions.get(conversationId) || {};
    const text = message.toLowerCase();

    // Logged-in detection
    if (customer?.email) {
      session.email = customer.email;
      session.isLoggedIn = true;
    }

    // Extract email if typed
    const emailMatch = message.match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    );
    if (emailMatch) {
      session.email = emailMatch[0];
    }

    // Intent detection
    if (text.includes("list") || text.includes("my orders")) {
      session.intent = "LIST_ORDERS";
    }
    if (text.includes("track")) {
      session.intent = "TRACK_ORDER";
    }

    sessions.set(conversationId, session);

    const needsIdentity =
      session.intent === "LIST_ORDERS" ||
      session.intent === "TRACK_ORDER";

    if (needsIdentity && !session.email && !session.isLoggedIn) {
      return res.json({
        reply: "Please share the email used for your orders."
      });
    }

    // List orders
    if (session.intent === "LIST_ORDERS") {
      const orders = await fetchOrdersByEmail(session.email);

      if (!orders.length) {
        return res.json({
          reply: "I couldn’t find any orders for that email."
        });
      }

      const reply = orders.slice(0, 5).map(o => (
        `#${o.order_number}
Payment: ${o.financial_status}
Fulfillment: ${o.fulfillment_status || "unfulfilled"}`
      )).join("\n\n");

      return res.json({ reply });
    }

    // Track order
    if (session.intent === "TRACK_ORDER") {
      const match = message.match(/#?\d{3,}/);
      if (!match) {
        return res.json({
          reply: "Please share your order number. Example: #1042"
        });
      }

      const order = await fetchOrderByNumber(match[0].replace("#", ""));
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

    return res.json({
      reply: "I can help with tracking orders or listing your orders."
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      reply: "Something went wrong."
    });
  }
}

const sessions = new Map();

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

async function fetchOrdersByEmail(email) {
  const res = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/2023-10/orders.json?email=${encodeURIComponent(
      email
    )}&status=any`,
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN
      }
    }
  );

  const data = await res.json();
  return data.orders || [];
}

async function fetchOrderByNumber(number) {
  const res = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/2023-10/orders.json?name=%23${number}&status=any`,
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN
      }
    }
  );

  const data = await res.json();
  return data.orders?.[0] || null;
}
