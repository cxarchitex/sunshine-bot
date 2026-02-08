import fetch from "node-fetch";

const sessions = {};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { message, conversationId, customer } = req.body;

  if (!conversationId) {
    return res.status(400).json({ reply: "Missing conversation id." });
  }

  const session =
    sessions[conversationId] ||
    (sessions[conversationId] = {
      email: null
    });

  const text = message.toLowerCase();

  // ✅ auto-hydrate email for logged-in users
  if (!session.email && customer?.loggedIn && customer?.email) {
    session.email = customer.email;
  }

  // 🔎 intent detection
  const wantsTracking =
    text.includes("track") ||
    text.includes("where is") ||
    text.includes("order status");

  const wantsList =
    text.includes("list") ||
    text.includes("my orders") ||
    text.includes("past orders");

  // 📧 ask for email only if needed
  if ((wantsTracking || wantsList) && !session.email) {
    return res.json({
      reply: "Please share the email used for your orders."
    });
  }

  // 📦 TRACK ORDER
  if (wantsTracking) {
    const order = await getLatestActiveOrder(session.email);

    if (!order) {
      return res.json({
        reply:
          "You don’t have any active orders right now. Would you like to see your past orders?"
      });
    }

    return res.json({
      reply: `Your order #${order.name} is currently ${order.fulfillment_status || "processing"}. Expected delivery by ${order.estimated_delivery || "soon"}.`
    });
  }

  // 📜 LIST ORDERS
  if (wantsList) {
    const orders = await listOrders(session.email);

    if (!orders.length) {
      return res.json({
        reply: "I couldn’t find any orders for this email."
      });
    }

    const summary = orders
      .map(
        (o) =>
          `#${o.name} • ${o.financial_status} • ${o.fulfillment_status || "processing"}`
      )
      .join("\n");

    return res.json({
      reply: `Here are your recent orders:\n${summary}`
    });
  }

  // 📧 capture email if user typed it
  if (!session.email && message.includes("@")) {
    session.email = message.trim();
    return res.json({
      reply: "Thanks. What would you like to do next?"
    });
  }

  return res.json({
    reply:
      "I can help with tracking orders, listing orders, or checking products."
  });
}

/* ---------- Shopify helpers ---------- */

async function listOrders(email) {
  // Replace with real Shopify Admin API
  return [];
}

async function getLatestActiveOrder(email) {
  // Replace with real Shopify Admin API
  return null;
}
