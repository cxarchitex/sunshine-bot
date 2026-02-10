// Vercel Node 18+ provides fetch globally

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

    // ---------- Restore / init session ----------
    const session =
      sessions.get(conversationId) || {
        orders: [],
        activeOrders: [],
        pastOrders: [],
        selectedOrder: null
      };

    /*
      =====================================================
      1️⃣ ORDER NUMBER SELECTION (ALWAYS FIRST)
      =====================================================
    */
    const orderNumberMatch = text.match(/^\s*#?(\d{1,6})\s*$/);

    if (orderNumberMatch && session.activeOrders.length) {
      const entered = orderNumberMatch[1];

      const found = session.activeOrders.find(o =>
        o.name?.replace("#", "") === entered
      );

      if (found) {
        session.selectedOrder = found;
        sessions.set(conversationId, session);
        return res.json({ reply: buildOrderStatus(found) });
      }

      const valid = session.activeOrders.map(o => o.name).join(", ");
      return res.json({
        reply: `That doesn’t look like one of your active orders. Please choose from: ${valid}`
      });
    }

    /*
      =====================================================
      2️⃣ LATEST / MOST RECENT ORDER
      =====================================================
    */
    if (isLatestOrderIntent(text) && session.activeOrders.length) {
      session.selectedOrder = session.activeOrders[0];
      sessions.set(conversationId, session);

      return res.json({
        reply: buildOrderStatus(session.selectedOrder)
      });
    }

    /*
      =====================================================
      3️⃣ TRACK ORDER INTENT
      =====================================================
    */
    const isTrackIntent =
      text.includes("track") ||
      text.includes("where is") ||
      text.includes("order status") ||
      text.includes("my order");

    if (isTrackIntent) {
      if (!customer?.loggedIn || !customer?.email) {
        return res.json({
          reply: "Please share the email used for your order."
        });
      }

      if (!session.orders.length) {
        session.orders = await fetchOrders(customer.email);
      }

      splitOrders(session);

      if (!session.activeOrders.length) {
        sessions.set(conversationId, session);
        return res.json({
          reply:
            "You don’t have any active orders right now. Would you like to see your past orders?"
        });
      }

      if (session.activeOrders.length === 1) {
        session.selectedOrder = session.activeOrders[0];
        sessions.set(conversationId, session);
        return res.json({
          reply: buildOrderStatus(session.selectedOrder)
        });
      }

      const list = session.activeOrders.map(o => o.name).join(", ");
      sessions.set(conversationId, session);

      return res.json({
        reply: `I see ${session.activeOrders.length} active orders: ${list}. Which one would you like to check?`
      });
    }

    /*
      =====================================================
      4️⃣ SHIPMENT FOLLOW-UP QUESTIONS
      =====================================================
    */
    if (session.selectedOrder && isShipmentFollowUp(text)) {
      let reply = buildOrderStatus(session.selectedOrder);

      if (isDelayed(session.selectedOrder)) {
        reply +=
          " This order is taking a bit longer than usual, but it’s still in progress.";
      }

      return res.json({ reply });
    }

    /*
      =====================================================
      FALLBACK
      =====================================================
    */
    return res.json({
      reply:
        "I can help you track your order, check delivery status, or view past orders."
    });
  } catch (err) {
    console.error(err);
    return res.json({
      reply: "Sorry, something went wrong while fetching your order."
    });
  }
}

/*
  =====================================================
  SHOPIFY ADMIN API
  =====================================================
*/
async function fetchOrders(email) {
  const store = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;

  if (!store || !token) {
    throw new Error("Shopify environment variables missing");
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

  return (data.orders || []).sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
}

/*
  =====================================================
  ORDER SPLITTING
  =====================================================
*/
function splitOrders(session) {
  session.activeOrders = session.orders.filter(
    o =>
      !o.cancelled_at &&
      o.fulfillment_status !== "fulfilled" &&
      o.financial_status !== "refunded"
  );

  session.pastOrders = session.orders.filter(
    o =>
      o.fulfillment_status === "fulfilled" ||
      o.financial_status === "refunded"
  );
}

/*
  =====================================================
  ORDER RESPONSE FORMATTER
  =====================================================
*/
function buildOrderStatus(order) {
  const fulfillment = order.fulfillments?.[0];

  let reply = `Your order ${order.name} is currently ${humanizeStatus(
    fulfillment?.status || order.fulfillment_status
  )}.`;

  if (fulfillment?.tracking_company) {
    reply += ` It’s being shipped via ${fulfillment.tracking_company}.`;
  }

  if (fulfillment?.tracking_number) {
    reply += ` Tracking number: ${fulfillment.tracking_number}.`;
  }

  if (fulfillment?.tracking_urls?.[0]) {
    reply += ` You can track it here: ${fulfillment.tracking_urls[0]}`;
  }

  return reply;
}

/*
  =====================================================
  PHASE 1 HELPERS
  =====================================================
*/
function isLatestOrderIntent(text) {
  return (
    text.includes("latest") ||
    text.includes("most recent") ||
    text.includes("last order")
  );
}

function isShipmentFollowUp(text) {
  return (
    text.includes("shipped") ||
    text.includes("arrive") ||
    text.includes("delivery") ||
    text.includes("where is it")
  );
}

function isDelayed(order) {
  const created = new Date(order.created_at);
  const days =
    (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);

  return (
    order.fulfillment_status === "unfulfilled" &&
    days > 5
  );
}

function humanizeStatus(status) {
  switch (status) {
    case "pending":
    case "unfulfilled":
      return "being prepared for shipment";
    case "partial":
      return "partially shipped";
    case "fulfilled":
      return "shipped";
    case "in_transit":
      return "on the way";
    default:
      return status || "processing";
  }
}
