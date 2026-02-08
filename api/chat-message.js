const sessionConversationMap = new Map();

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const { session_id, message } = req.body || {};

  if (!session_id || !message) {
    return res.status(400).json({ error: "Missing session_id or message" });
  }

  try {
    // Get or create Sunshine conversation
    let conversationId = sessionConversationMap.get(session_id);

    if (!conversationId) {
      conversationId = await createConversation(session_id);
      sessionConversationMap.set(session_id, conversationId);
    }

    // Send user message to Sunshine
    await sendMessage(conversationId, message, "user");

    // Bot logic
    let reply;

    // Order number detected
    if (/^\d{4,}$/.test(message.trim())) {
      const order = await fetchOrderByNumber(message.trim());

      if (!order) {
        reply = `I couldn’t find an order with number ${message}. Please double-check the order number.`;
      } else {
        reply =
          `📦 Order ${order.name}\n` +
          `Status: ${order.fulfillmentStatus || "Not fulfilled"}\n` +
          `Payment: ${order.financialStatus}`;
      }
    }
    // Order intent
    else if (/track|order status|where is my order/i.test(message)) {
      reply = "Sure 🙂 Please share your order number.";
    }
    // Refund intent
    else if (/refund|return/i.test(message)) {
      reply = "I can help with refunds. Please share your order number.";
    }
    // Default
    else {
      reply = "Hi 👋 How can I help you today?";
    }

    // Send bot reply
    await sendMessage(conversationId, reply, "bot");

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("CHAT MESSAGE ERROR:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/* ---------------- HELPERS ---------------- */

// Shopify order lookup (Admin GraphQL API)
async function fetchOrderByNumber(orderNumber) {
  const query = `
    {
      orders(first: 1, query: "name:#${orderNumber}") {
        edges {
          node {
            name
            financialStatus
            fulfillmentStatus
          }
        }
      }
    }
  `;

  const res = await fetch(
    `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN
      },
      body: JSON.stringify({ query })
    }
  );

  const json = await res.json();
  return json?.data?.orders?.edges?.[0]?.node || null;
}

// Create Sunshine user + conversation
async function createConversation(sessionId) {
  // 1. Upsert user
  await fetch(
    `https://api.smooch.io/v2/apps/${process.env.SUNSHINE_APP_ID}/users`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " +
          Buffer.from(
            `${process.env.SUNSHINE_KEY_ID}:${process.env.SUNSHINE_KEY_SECRET}`
          ).toString("base64")
      },
      body: JSON.stringify({
        externalId: sessionId
      })
    }
  );

  // 2. Create conversation
  const res = await fetch(
    `https://api.smooch.io/v2/apps/${process.env.SUNSHINE_APP_ID}/conversations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " +
          Buffer.from(
            `${process.env.SUNSHINE_KEY_ID}:${process.env.SUNSHINE_KEY_SECRET}`
          ).toString("base64")
      },
      body: JSON.stringify({
        type: "personal",
        participants: [
          {
            role: "user",
            userExternalId: sessionId
          }
        ]
      })
    }
  );

  const json = await res.json();

  if (!res.ok || !json?.conversation?.id) {
    console.error("Sunshine error:", json);
    throw new Error("Failed to create Sunshine conversation");
  }

  return json.conversation.id;
}

// Send message to Sunshine
async function sendMessage(conversationId, text, sender) {
  await fetch(
    `https://api.smooch.io/v2/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " +
          Buffer.from(
            `${process.env.SUNSHINE_KEY_ID}:${process.env.SUNSHINE_KEY_SECRET}`
          ).toString("base64")
      },
      body: JSON.stringify({
        author: sender === "bot" ? { type: "business" } : { type: "user" },
        content: {
          type: "text",
          text
        }
      })
    }
  );
}
