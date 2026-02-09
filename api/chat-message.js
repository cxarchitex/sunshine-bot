// NOTE: Node 18+ on Vercel provides fetch globally
// DO NOT import node-fetch

const sessions = new Map();

export default async function handler(req, res) {
  // ---------- CORS ----------
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { message, conversationId, customer } = req.body || {};

    if (!conversationId || !message) {
      return res.json({ reply: "Invalid request." });
    }

    const text = message.toLowerCase().trim();

    // ---------- Session ----------
    const session =
      sessions.get(conversationId) || {
        orders: [],
        selectedOrder: null
      };

    // ---------- Detect order number ----------
    const orderNumberMatch = text.match(/#?(\d{3,})/);

    if (orderNumberMatch && session.orders.length) {
      const num = orderNumberMatch[1];
      const found = session.orders.find(
        o => String(o.number) === num
      );

      if (found) {
        session.selectedOrder = found;
        sessions.set(conversationId, session);
        return res.json({ reply: buildOrderStatus(found) });
      }
    }

    // ---------- Track order intent ----------
    if (
      text.includes("track") ||
      text.includes("where is") ||
      text.includes("order status")
    ) {
      // Logged-in user
      if (customer?.loggedIn && customer?.email) {
        if (!session.orders.length) {
          session.orders = await fetchOrders(customer.email);
        }

        const activeOrders = session.orders.filter(
          o =>
            !o.cancelled_at &&
            o.fulfillment_status !== "fulfilled" &&
            o.financial_status !== "refunded"
        );

        if (!activeOrders.length) {
          sessions.set(conversationId, session);
          return res.json({
            reply:
              "You don’t have any active orders right now. Would you like to know about your past orders?"
          });
        }

        if (activeOrders.length === 1) {
          session.selectedOrder = activeOrders[0];
          sessions.set(conversationId, session);
          return res.json({
            reply: buildOrderStatus(activeOrders[0])
          });
        }

        session.orders = activeOrders;
        sessions.set(conversationId, session);

        const numbers = activeOrders
          .map(o => `#${o.number}`)
          .join(", ");

        return res.json({
          reply: `I see ${activeOrders.length} active orders: ${numbers}. Which order would you like to know about?`
        });
      }

      // Guest
      return res.json({
        reply: "Please share the email used for your order."
      });
    }

    // ---------- Email capture (guest) ----------
    const emailMatch = text.match(
      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/
    );

    if (emailMatch) {
      const email = emailMatch[0];
      session.orders = await fetchOrders(email);

      const activeOrders = session.orders.filter(
        o =>
          !o.cancelled_at &&
          o.fulfillment_status !== "fulfilled" &&
          o.financial_status !== "refunded"
      );

      if (!activeOrders.length) {
        sessions.set(conversationId, session);
        return res.json({
          reply:
            "There are no active orders for this email. Would you like to know about your past orders?"
        });
      }

      if (activeOrders.length === 1) {
        session.selectedOrder = activeOrders[0];
        sessions.set(conversationId, session);
        return res.json({
          reply: buildOrderStatus(activeOrders[0])
        });
      }

      session.orders = activeOrders;
      sessions.set(conversationId, session);

      const numbers = activeOrders
        .map(o => `#${o.number}`)
        .join(", ");

      return res.json({
        reply: `I see ${activeOrders.length} active orders: ${numbers}. Which order would you like to know about?`
      });
    }

    // ---------- Follow-up ----------
    if (session.selectedOrder) {
      return res.json({
        reply: buildOrderStatus(session.selectedOrder)
      });
    }

    return res.json({
      reply:
        "I can help you track orders, list orders, or check order status."
    });
  } catch (err) {
    console.error(err);
    return res.json({
      reply: "Sorry, something went wrong while fetching your order."
    });
  }
}

/* ---------- Shopify Admin API ---------- */

async function fetchOrders(email) {
  const store = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;

  if (!store || !token) {
    throw new Error("Shopify env vars missing");
  }

  const url = `https://${store}/admin/api/2024-01/orders.json?status=any&email=${encodeURIComponent(
    email
  )}`;

  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json"
    }
  });

  const data = await res.json();
  return data.orders || [];
}

/* ---------- Formatter ---------- */

function buildOrderStatus(order) {
  const tracking =
    order.fulfillments?.[0]?.tracking_urls?.[0];

  let reply = `Your order #${order.number} is currently ${
    order.fulfillment_status || "being processed"
  }.`;

  if (tracking) {
    reply += ` You can track it here: ${tracking}`;
  }

  return reply;
}
