import fetch from "node-fetch";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

// simple in-memory session store (per Vercel instance)
const sessions = new Map();

export default async function handler(req, res) {
  // ---- CORS ----
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  try {
    const { message, conversationId, customer } = req.body;

    if (!conversationId) {
      return res.status(400).json({ reply: "Missing conversation id." });
    }

    const text = message.toLowerCase().trim();

    // get or init session
    const session =
      sessions.get(conversationId) || {
        selectedOrder: null,
        orders: []
      };

    // ---------- FETCH ORDERS ON FIRST NEED ----------
    async function fetchOrders(email) {
      const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/orders.json?status=any&email=${encodeURIComponent(
        email
      )}`;

      const response = await fetch(url, {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_TOKEN
        }
      });

      const data = await response.json();
      return data.orders || [];
    }

    // ---------- DETECT ORDER NUMBER ----------
    const orderNumberMatch = text.match(/#?(\d{3,})/);
    if (orderNumberMatch && session.orders.length) {
      const orderNum = orderNumberMatch[1];

      const found = session.orders.find(
        o => String(o.number) === orderNum
      );

      if (found) {
        session.selectedOrder = found;
        sessions.set(conversationId, session);

        return res.json({
          reply: buildOrderStatus(found)
        });
      }
    }

    // ---------- TRACK / WHERE IS ORDER ----------
    if (
      text.includes("track") ||
      text.includes("where is") ||
      text.includes("order")
    ) {
      // logged-in user
      if (customer?.loggedIn && customer?.email) {
        if (!session.orders.length) {
          session.orders = await fetchOrders(customer.email);
        }

        const activeOrders = session.orders.filter(
          o =>
            o.fulfillment_status !== "fulfilled" &&
            o.financial_status !== "refunded"
        );

        if (!activeOrders.length) {
          sessions.set(conversationId, session);
          return res.json({
            reply:
              "You have no active orders. Would you like to know about your past orders?"
          });
        }

        if (activeOrders.length === 1) {
          session.selectedOrder = activeOrders[0];
          sessions.set(conversationId, session);
          return res.json({
            reply: buildOrderStatus(activeOrders[0])
          });
        }

        const orderNumbers = activeOrders
          .map(o => `#${o.number}`)
          .join(", ");

        session.orders = activeOrders;
        sessions.set(conversationId, session);

        return res.json({
          reply: `I see ${activeOrders.length} active orders: ${orderNumbers}. Which order would you like to know about?`
        });
      }

      // guest user
      return res.json({
        reply: "Please share the email used for your order."
      });
    }

    // ---------- EMAIL CAPTURE (GUEST) ----------
    const emailMatch = text.match(
      /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/
    );

    if (emailMatch) {
      const email = emailMatch[0];
      session.orders = await fetchOrders(email);

      const activeOrders = session.orders.filter(
        o =>
          o.fulfillment_status !== "fulfilled" &&
          o.financial_status !== "refunded"
      );

      if (!activeOrders.length) {
        sessions.set(conversationId, session);
        return res.json({
          reply:
            "There are no active orders for this email. Would you like to see past orders?"
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

      const orderNumbers = activeOrders
        .map(o => `#${o.number}`)
        .join(", ");

      return res.json({
        reply: `I see ${activeOrders.length} active orders: ${orderNumbers}. Which order would you like to know about?`
      });
    }

    // ---------- FOLLOW UPS ----------
    if (session.selectedOrder) {
      return res.json({
        reply: buildOrderStatus(session.selectedOrder)
      });
    }

    return res.json({
      reply:
        "I can help with tracking orders, listing orders, or checking products."
    });
  } catch (err) {
    console.error(err);
    return res.json({
      reply: "Sorry, something went wrong while fetching your order."
    });
  }
}

// ---------- ORDER RESPONSE FORMAT ----------
function buildOrderStatus(order) {
  const tracking =
    order.fulfillments?.[0]?.tracking_urls?.[0] || null;

  let reply = `Your order #${order.number} is currently ${order.fulfillment_status || "being processed"}.`;

  if (tracking) {
    reply += ` You can track it here: ${tracking}`;
  }

  return reply;
}
