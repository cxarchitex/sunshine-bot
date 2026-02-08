export default async function handler(req, res) {
  // ===== CORS HEADERS (ALWAYS FIRST) =====
  res.setHeader("Access-Control-Allow-Origin", "https://cx-demostore.myshopify.com");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { message, conversationId, customerEmail } = req.body;

    if (!message || !conversationId) {
      return res.status(400).json({ error: "Missing message or conversationId" });
    }

    // ===== SIMPLE IN-MEMORY SESSION =====
    global.sessions = global.sessions || {};
    const sessions = global.sessions;
    const session = sessions[conversationId] || {};
    sessions[conversationId] = session;

    const intent = detectIntent(message);
    const orderNumber = extractOrderNumber(message);

    // ===== LIST ORDERS =====
    if (intent === "list_orders") {
      if (!customerEmail) {
        return reply(res, "Please log in so I can fetch your orders.");
      }

      const orders = await fetchOrdersByEmail(customerEmail);

      if (!orders.length) {
        return reply(res, "I couldn’t find any orders under your email.");
      }

      return reply(res, formatOrderList(orders));
    }

    // ===== TRACK ORDER =====
    if (intent === "track_order") {
      session.intent = "track_order";

      if (orderNumber) {
        const order = await fetchOrderByNumber(orderNumber);

        if (!order) {
          return reply(res, "I couldn’t find an order with that number.");
        }

        delete sessions[conversationId];
        return reply(res, formatOrderStatus(order));
      }

      session.awaitingOrderNumber = true;
      return reply(res, "Sure 🙂 Please share your order number.");
    }

    // ===== CONTINUATION =====
    if (session.intent === "track_order" && session.awaitingOrderNumber) {
      if (!orderNumber) {
        return reply(res, "Please share a valid order number.");
      }

      const order = await fetchOrderByNumber(orderNumber);

      if (!order) {
        return reply(res, "I couldn’t find an order with that number.");
      }

      delete sessions[conversationId];
      return reply(res, formatOrderStatus(order));
    }

    // ===== FALLBACK =====
    return reply(
      res,
      "I can help with tracking orders, listing orders, or checking products."
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

function detectIntent(text) {
  const msg = text.toLowerCase();

  if (msg.match(/list.*order|my orders|recent orders/)) return "list_orders";
  if (msg.match(/track|where.*order|order status/)) return "track_order";

  return "unknown";
}

function extractOrderNumber(text) {
  const match = text.match(/\b\d{3,}\b/);
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

  if (!res.ok) throw new Error("Shopify fetch failed");

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

  if (!res.ok) throw new Error("Shopify fetch failed");

  const data = await res.json();
  return data.orders?.[0] || null;
}

function formatOrderList(orders) {
  return orders
    .slice(0, 5)
    .map(o => `• ${o.name} — ${o.financial_status} — ${o.fulfillment_status || "unfulfilled"}`)
    .join("\n");
}

function formatOrderStatus(order) {
  return `
Order ${order.name}

Payment: ${order.financial_status}
Fulfillment: ${order.fulfillment_status || "Not fulfilled"}
Cancelled: ${order.cancelled_at ? "Yes" : "No"}
${order.fulfillments?.[0]?.tracking_url ? `Tracking: ${order.fulfillments[0].tracking_url}` : ""}
`.trim();
}
