const sessions = {};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { message, conversationId, customerId } = req.body;
  const text = message.toLowerCase().trim();

  if (!sessions[conversationId]) {
    sessions[conversationId] = { customerId };
  }

  const session = sessions[conversationId];

  // ---- LIST ORDERS ----
  if (/list.*orders|my orders|show orders/.test(text)) {
    if (!customerId) {
      return reply(res, "Please log in to view your orders.");
    }
    return listOrders(customerId, res);
  }

  // ---- TRACK ORDER ----
  if (/track|where.*order|order status/.test(text)) {
    session.intent = "TRACK_ORDER";
    return reply(res, "Sure 🙂 Please share your order number.");
  }

  const match = text.match(/#?(\d{3,})/);
  if (match && session.intent === "TRACK_ORDER") {
    return fetchOrder(match[1], customerId, res);
  }

  return reply(res, "I can help with tracking or listing your orders.");
}

/* ---------------- HELPERS ---------------- */

function reply(res, text) {
  return res.status(200).json({ reply: text });
}

async function listOrders(customerId, res) {
  const orders = await shopify(`/orders.json?customer_id=${customerId}&status=any`);

  if (!orders.length) {
    return reply(res, "You don’t have any orders yet.");
  }

  const list = orders
    .slice(0, 5)
    .map(o => `#${o.order_number} • ${o.financial_status} • ${o.fulfillment_status || "unfulfilled"}`)
    .join("\n");

  return reply(res, "Here are your recent orders:\n" + list);
}

async function fetchOrder(orderNumber, customerId, res) {
  const orders = await shopify(`/orders.json?name=${orderNumber}&status=any`);

  const order = orders.find(o => String(o.customer?.id) === String(customerId));

  if (!order) {
    return reply(res, "I couldn’t find that order.");
  }

  return reply(
    res,
    `Order #${order.order_number}\nPayment: ${order.financial_status}\nFulfillment: ${order.fulfillment_status || "pending"}`
  );
}

async function shopify(path) {
  const r = await fetch(
    `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${process.env.SHOPIFY_API_VERSION}${path}`,
    {
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
        "Content-Type": "application/json"
      }
    }
  );
  return (await r.json()).orders || [];
}
