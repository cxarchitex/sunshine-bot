export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { message, conversationId, customerEmail } = req.body;

    if (!message || !conversationId) {
      return res.status(400).json({ error: "Missing message or conversationId" });
    }

    // Session store (in-memory)
    global.sessions = global.sessions || {};
    const sessions = global.sessions;

    const session = sessions[conversationId] || {};
    sessions[conversationId] = session;

    const intent = detectIntent(message);
    const orderNumber = extractOrderNumber(message);

    // ===== LIST ORDERS =====
    if (intent === "list_orders") {
      if (!customerEmail) {
        return reply(res, "Please make sure you are logged in so I can fetch your orders.");
      }

      const orders = await fetchOrdersByEmail(customerEmail);

      if (!orders.length) {
        return reply(res, "I couldn’t find any orders under your email.");
      }

      return reply(res, `Here are your recent orders 👇\n\n${formatOrderList(orders)}`);
    }

    // ===== TRACK ORDER =====
    if (intent === "track_order") {
      session.intent = "track_order";

      if (orderNumber) {
        const order = await fetchOrderByNumber(orderNumber);

        if (!order) {
          return reply(res, "I couldn’t find an order with that number. Please double-check it.");
        }

        delete sessions[conversationId];
        return reply(res, formatOrderStatus(order));
      }

      session.awaitingOrderNumber = true;
      return reply(res, "Sure 🙂 Please share your order number.");
    }

    // ===== CONTINUE TRACK ORDER FLOW =====
    if (session.intent === "track_order" && session.awaitingOrderNumber) {
      if (!orderNumber) {
        return reply(res, "Please share a valid order number.");
      }

      const order = await fetchOrderByNumber(orderNumber);

      if (!order) {
        return reply(res, "I couldn’t find an order with that number. Please double-check it.");
      }

      delete sessions[conversationId];
      return reply(res, formatOrderStatus(order));
    }

    // ===== FALLBACK =====
    return reply(
      res,
      "I can help with tracking an order, listing your orders, or checking product and cart details."
    );
  } catch (error) {
    console.error("CHAT MESSAGE ERROR:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/* ================= HELPERS ================= */

function reply(res, text) {
  return res.status(200).json({ reply: text });
}

function detectIntent(message) {
  const text = message.toLowerCase();

  if (text.match(/list.*order|my orders|recent orders|show.*orders/)) {
    return "list_orders";
  }

  if (text.match(/track|where.*order|order status|find.*order/)) {
    return "track_order";
  }

  return "unknown";
}

function extractOrderNumber(message) {
  const match = message.match(/\b\d{3,}\b/);
  return match ? match[0] : null;
}

/* ================= SHOPIFY ================= */

async function fetchOrdersByEmail(email) {
  const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/orders.json?email=${encodeURIComponent(
    email
  )}&status=any`;

  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error("Failed to fetch orders");
  }

  const data = await res.json();
  return data.orders || [];
}

async function fetchOrderByNumber(orderNumber) {
  const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/orders.json?name=${orderNumber}&status=any`;

  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error("Failed to fetch order");
  }

  const data = await res.json();
  return data.orders?.[0] || null;
}

function formatOrderList(orders) {
  return orders
    .slice(0, 5)
    .map(
      o =>
        `• ${o.name} — ${o.fulfillment_status || "unfulfilled"} — ${o.financial_status}`
    )
    .join("\n");
}

function formatOrderStatus(order) {
  return `
Order ${order.name}

Financial status: ${order.financial_status}
Fulfillment status: ${order.fulfillment_status || "Not fulfilled"}
Cancelled: ${order.cancelled_at ? "Yes" : "No"}
${
  order.fulfillments?.[0]?.tracking_url
    ? `Tracking link: ${order.fulfillments[0].tracking_url}`
    : ""
}
`.trim();
}
