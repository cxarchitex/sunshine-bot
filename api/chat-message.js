// Vercel Node 18+ provides fetch globally

const sessions = new Map();

export default async function handler(req, res) {
  // CORS
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

    // Restore or init session
    const session =
      sessions.get(conversationId) || {
        orders: [],
        activeOrders: [],
        pastOrders: [],
        selectedOrder: null
      };

    /*
      =====================================================
      1) ORDER NUMBER SELECTION (FIRST)
      =====================================================
    */
    const orderNumberMatch = text.match(/^\s*#?(\d{1,6})\s*$/);

    if (orderNumberMatch && session.activeOrders.length) {
      const entered = orderNumberMatch[1];

      const found = session.activeOrders.find(o => {
        const num = o.name?.replace("#", "");
        return num === entered;
      });

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
      2) TRACK ORDER INTENT
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
      3) PAST ORDERS REQUEST
      =====================================================
    */
    if (text.includes("past order") || text.includes("previous order")) {
      if (!session.pastOrders.length) {
        return res.json({
          reply: "You don’t have any past orders."
        });
      }

      const list = session.pastOrders
        .slice(0, 5)
        .map(
          o => `${o.name} – ${humanizeFulfillmentStatus(o.fulfillment_status)}`
        )
        .join("\n");

      return res.json({
        reply: `Here are your recent past orders:\n${list}`
      });
    }

    /*
      =====================================================
      4) FOLLOW-UP QUESTIONS
      =====================================================
    */
    if (session.selectedOrder) {
      return res.json({
        reply: buildOrderStatus(session.selectedOrder)
      });
    }

    return res.json({
      reply:
        "I can help you track orders, check delivery status, or view past orders."
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
  const fulfillments = order.fulfillments || [];
  const items = order.line_items || [];

  const itemSummary = items
    .map(i => `${i.quantity} × ${i.title}`)
    .join(", ");

  let reply = `Your order ${order.name} includes ${itemSummary}. `;

  if (fulfillments.length > 1) {
    reply += `Part of your order has shipped and the rest is being prepared. `;
  }

  const f = fulfillments[0];

  if (!f) {
    reply += "It’s currently being prepared for shipment.";
    return reply.trim();
  }

  reply += `Current status: ${humanizeFulfillmentStatus(
    f.status || order.fulfillment_status
  )}. `;

  if (f.tracking_company) {
    reply += `Shipped via ${f.tracking_company}. `;
  }

  if (f.tracking_number) {
    reply += `Tracking number: ${f.tracking_number}. `;
  }

  if (f.tracking_urls?.[0]) {
    reply += `Track here: ${f.tracking_urls[0]} `;
  }

  if (f.estimated_delivery_at) {
    reply += `Estimated delivery: ${new Date(
      f.estimated_delivery_at
    ).toLocaleDateString()}.`;
  } else if (f.delivered_at) {
    reply += `Delivered on ${new Date(
      f.delivered_at
    ).toLocaleDateString()}.`;
  }

  return reply.trim();
}

function humanizeFulfillmentStatus(status) {
  switch (status) {
    case "pending":
    case "unfulfilled":
      return "being prepared for shipment";
    case "partial":
      return "partially shipped";
    case "open":
      return "ready to ship";
    case "in_transit":
      return "on the way";
    case "delivered":
      return "delivered";
    case "fulfilled":
      return "shipped";
    default:
      return status || "processing";
  }
}
