const sessionConversationMap = new Map();
const sessionState = new Map();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const { session_id, message, context } = req.body || {};
  if (!session_id || !message) {
    return res.status(400).json({ error: "Missing data" });
  }

  let conversationId = sessionConversationMap.get(session_id);
  if (!conversationId) {
    conversationId = await createConversation(session_id);
    sessionConversationMap.set(session_id, conversationId);
  }

  await sendMessage(conversationId, message, "user");

  const text = message.toLowerCase().trim();
  let state = sessionState.get(session_id) || {};
  let reply;

  const orderMatch = text.match(/\b\d{4,}\b/);
  const orderNumber = orderMatch ? orderMatch[0] : null;

  /* PRIORITY 1: CART */
  if (/cart/.test(text)) {
    if (!context?.cart || context.cart.items.length === 0) {
      reply = "Your cart is currently empty. Would you like help finding a product?";
    } else {
      const items = context.cart.items
        .map(i => `• ${i.title} ×${i.quantity}`)
        .join("\n");
      reply =
        `You currently have ${context.cart.items.length} item(s) in your cart:\n` +
        `${items}\n\nWould you like help checking out or modifying your cart?`;
    }
  }

  /* PRIORITY 2: PRODUCT */
  else if (context?.product && /this|it|price|compatible|available/.test(text)) {
    reply =
      `You’re viewing ${context.product.title}.\n` +
      `Price: ₹${context.product.price}\n` +
      `Would you like compatibility details, delivery info, or to add it to your cart?`;
  }

  /* PRIORITY 3: ORDER TRACKING */
  else if (/track|order status|where is my order/.test(text)) {
    state.flow = "track";
    if (orderNumber) {
      reply = await handleOrder(orderNumber);
      state.flow = null;
    } else {
      reply = "Sure 🙂 Please share your order number.";
    }
  }

  else if (state.flow === "track" && orderNumber) {
    reply = await handleOrder(orderNumber);
    state.flow = null;
  }

  /* PRIORITY 4: CANCELLATION */
  else if (/cancel/.test(text)) {
    state.flow = "cancel";
    reply = "Please share your order number so I can check if it can be cancelled.";
  }

  /* FALLBACK */
  else {
    reply =
      "I can help with your cart, product details, or order tracking.\n" +
      "What would you like to do?";
  }

  sessionState.set(session_id, state);
  await sendMessage(conversationId, reply, "bot");
  res.status(200).json({ reply });
}

async function handleOrder(orderNumber) {
  const order = await fetchOrderByNumber(orderNumber);
  if (!order) {
    return `I couldn’t find an order with number ${orderNumber}. Please double-check it.`;
  }
  return (
    `📦 Order ${order.name}\n` +
    `Status: ${order.fulfillmentStatus || "Not fulfilled"}\n` +
    `Payment: ${order.financialStatus}\n\n` +
    `Would you like help with cancellation or returns?`
  );
}

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

async function createConversation(sessionId) {
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
      body: JSON.stringify({ externalId: sessionId })
    }
  );

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
        participants: [{ role: "user", userExternalId: sessionId }]
      })
    }
  );

  const json = await res.json();
  return json.conversation.id;
}

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
        content: { type: "text", text }
      })
    }
  );
}
