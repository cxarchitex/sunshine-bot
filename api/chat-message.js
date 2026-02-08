export default async function handler(req, res) {
  // ---------------------------
  // CORS (MUST be first)
  // ---------------------------
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ---------------------------
  // Request payload
  // ---------------------------
  const { message, conversationId, customer } = req.body || {};

  if (!message || !conversationId) {
    return res.status(400).json({ reply: "Invalid request." });
  }

  // ---------------------------
  // In-memory session store
  // ---------------------------
  global.sessions = global.sessions || {};

  const session =
    global.sessions[conversationId] || {
      intent: null,
      email: null,
      awaitingOrderNumber: false
    };

  global.sessions[conversationId] = session;

  const text = message.toLowerCase();

  // ---------------------------
  // Intent detection
  // ---------------------------
  if (
    text.includes("track") ||
    text.includes("where is") ||
    text.includes("order status") ||
    text.includes("my order")
  ) {
    session.intent = "TRACK_ORDER";
  }

  // ---------------------------
  // Logged-in customer handling
  // ---------------------------
  if (customer?.loggedIn && customer?.email) {
    session.email = customer.email;
  }

  // ---------------------------
  // Ask for email if needed
  // ---------------------------
  if (session.intent === "TRACK_ORDER" && !session.email) {
    const emailMatch = message.match(/\S+@\S+\.\S+/);

    if (!emailMatch) {
      return res.json({
        reply: "Please share the email used for your order."
      });
    }

    session.email = emailMatch[0];
  }

  // ---------------------------
  // Fetch orders from Shopify
  // ---------------------------
  let orders = [];
  try {
    orders = await fetchOrdersByEmail(session.email);
  } catch (err) {
    console.error("Shopify error:", err);
    return res.json({
      reply: "Sorry, I couldn’t fetch your orders right now."
    });
  }

  if (!orders.length) {
    return res.json({
      reply: "I couldn’t find any orders for that email."
    });
  }

  // ---------------------------
  // Active orders logic
  // ---------------------------
  const activeOrders = orders.filter(o =>
    !o.cancelled_at &&
    (o.fulfillment_status === null ||
      o.fulfillment_status === "unfulfilled" ||
      o.fulfillment_status === "partial")
  );

  if (!activeOrders.length) {
    return res.json({
      reply:
        "You don’t have any active orders right now. Would you like to see your past orders?"
    });
  }

  if (activeOrders.length > 1 && !session.awaitingOrderNumber) {
    session.awaitingOrderNumber = true;
    return res.json({
      reply:
        "I found more than one active order. Please tell me the order number you want to track."
    });
  }

  // ---------------------------
  // Order number selection
  // ---------------------------
  let order = activeOrders[0];

  if (session.awaitingOrderNumber) {
    const num = message.replace("#", "").trim();
    const matched = activeOrders.find(
      o => String(o.order_number) === num
    );

    if (!matched) {
      return res.json({
        reply: "I couldn’t find that order number. Please try again."
      });
    }

    order = matched;
    session.awaitingOrderNumber = false;
  }

  // ---------------------------
  // Build response
  // ---------------------------
  const fulfillment = order.fulfillments?.[0];
  const trackingUrl = fulfillment?.tracking_url;

  let reply = `Order #${order.order_number}\n`;

  if (!order.fulfillment_status) {
    reply += "Status: Being prepared for shipment.";
  } else if (order.fulfillment_status === "partial") {
    reply += "Status: Partially shipped.";
  } else {
    reply += "Status: Shipped.";
  }

  if (trackingUrl) {
    reply += `\nTracking link: ${trackingUrl}`;
  }

  return res.json({ reply });
}

// ---------------------------
// Shopify helper (Node 18+ fetch)
// ---------------------------
async function fetchOrdersByEmail(email) {
  const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-01/orders.json?email=${encodeURIComponent(
    email
  )}&status=any`;

  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMINS_TOKEN,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error("Shopify request failed");
  }

  const data = await res.json();
  return data.orders || [];
}
