// api/chat-message.js

const sessions = new Map(); // in-memory session store (OK for now)

export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { message, conversationId } = req.body;

    if (!message || !conversationId) {
      return res.status(400).json({ error: "Missing message or conversationId" });
    }

    const text = message.toLowerCase().trim();

    // Load or init session
    const session = sessions.get(conversationId) || {
      intent: null,
      awaiting: null
    };

    // ---------- INTENT DETECTION ----------
    const isTrackOrder =
      text.includes("track") ||
      text.includes("where is my order");

    const isListOrders =
      text.includes("list my orders") ||
      text.includes("my orders");

    const orderNumberMatch = text.match(/\b\d{3,}\b/); // simple numeric order id

    // ---------- STATE HANDLING ----------

    // User provided order number
    if (session.awaiting === "ORDER_NUMBER" && orderNumberMatch) {
      const orderNumber = orderNumberMatch[0];

      session.awaiting = null;
      sessions.set(conversationId, session);

      // TODO: replace with Shopify fetch
      return res.json({
        reply: `✅ Order #${orderNumber} is currently *fulfilled* and on the way.`
      });
    }

    // Track order intent
    if (isTrackOrder) {
      session.intent = "TRACK_ORDER";
      session.awaiting = "ORDER_NUMBER";
      sessions.set(conversationId, session);

      return res.json({
        reply: "Sure 🙂 Please share your order number."
      });
    }

    // List orders intent
    if (isListOrders) {
      session.intent = "LIST_ORDERS";
      sessions.set(conversationId, session);

      // TODO: replace with Shopify list orders
      return res.json({
        reply:
          "Here are your recent orders:\n" +
          "• #1344 – Fulfilled\n" +
          "• #1341 – Processing\n" +
          "• #1339 – Cancelled"
      });
    }

    // If bot is waiting for order number but user sends junk
    if (session.awaiting === "ORDER_NUMBER") {
      sessions.set(conversationId, session);
      return res.json({
        reply: "Please share a valid order number."
      });
    }

    // ---------- DEFAULT ----------
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
