// api/chat-message.js

const sessions = new Map();

const SHOP = process.env.SHOPIFY_SHOP_DOMAIN;
const TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const VERSION = process.env.SHOPIFY_API_VERSION || "2024-01";

async function shopifyFetch(path) {
  const res = await fetch(`https://${SHOP}/admin/api/${VERSION}/${path}`, {
    headers: {
      "X-Shopify-Access-Token": TOKEN,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return res.json();
}

export default async function handler(req, res) {
  // ---- CORS ----
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { message, conversationId } = req.body;
    if (!message || !conversationId) {
      return res.status(400).json({ reply: "Invalid request" });
    }

    const text = message.toLowerCase().trim();
    const session =
      sessions.get(conversationId) || {
        intent: null,
        awaiting: null,
        email: null
      };

    // ---- Extract email ----
    const emailMatch = message.match(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
    );

    if (emailMatch) {
      session.email = emailMatch[0];
      session.awaiting = null;
      sessions.set(conversationId, session);
    }

    // ---- Extract order number ----
    const orderNumberMatch = message.match(/\b\d{3,}\b/);

    // ---- INTENTS ----
    const wantsTrack =
      text.includes("track") || text.includes("where is my order");

    const wantsList =
      text.includes("list my orders") || text.includes("my orders");

    // ---- TRACK ORDER ----
    if (wantsTrack) {
      session.intent = "TRACK_ORDER";

      if (!session.email) {
        session.awaiting = "EMAIL";
        sessions.set(conversationId, session);
        return res.json({
          reply: "Sure 🙂 Please share the email used for your order."
        });
      }

      session.awaiting = "ORDER_NUMBER";
      sessions.set(conversationId, session);
      return res.json({
        reply: "Got it 👍 Please share your order number."
      });
    }

    // ---- LIST ORDERS ----
    if (wantsList) {
      session.intent = "LIST_ORDERS";

      if (!session.email) {
        session.awaiting = "EMAIL";
        sessions.set(conversationId, session);
        return res.json({
          reply: "Please share the email used for your orders."
        });
      }

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
            `• #${o.order_number} – ${o.financial_status}, ${o.fulfillment_status || "unfulfilled"}`
        )
        .join("\n");

      return res.json({
        reply: `Here are your recent orders:\n${summary}`
      });
    }

    // ---- HANDLE EMAIL PROVIDED ----
    if (session.awaiting === "EMAIL" && session.email) {
      sessions.set(conversationId, session);

      if (session.intent === "LIST_ORDERS") {
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
              `• #${o.order_number} – ${o.financial_status}, ${o.fulfillment_status || "unfulfilled"}`
          )
          .join("\n");

        return res.json({
          reply: `Here are your recent orders:\n${summary}`
        });
      }

      return res.json({
        reply: "Thanks 🙂 Please continue."
      });
    }

    // ---- HANDLE ORDER NUMBER ----
    if (
      session.intent === "TRACK_ORDER" &&
      session.awaiting === "ORDER_NUMBER" &&
      orderNumberMatch
    ) {
      const orderNumber = orderNumberMatch[0];

      const data = await shopifyFetch(
        `orders.json?name=${orderNumber}&status=any`
      );

      if (!data.orders.length) {
        return res.json({
          reply: "I couldn’t find an order with that number."
        });
      }

      const o = data.orders[0];

      session.awaiting = null;
      sessions.set(conversationId, session);

      return res.json({
        reply:
          `Order #${o.order_number} status:\n` +
          `• Payment: ${o.financial_status}\n` +
          `• Fulfillment: ${o.fulfillment_status || "unfulfilled"}`
      });
    }

    // ---- DEFAULT ----
    sessions.set(conversationId, session);
    return res.json({
      reply:
        "Hi 👋 I can help with tracking orders, listing orders, or checking products."
    });
  } catch (err) {
    console.error("Chat error:", err);
    return res.status(500).json({
      reply: "Sorry, something went wrong."
    });
  }
}
