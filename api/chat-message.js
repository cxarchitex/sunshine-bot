// Vercel Node 18+ provides fetch globally

const sessions = new Map();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { message, conversationId, customer } = req.body || {};
    if (!conversationId || !message) {
      return res.json({ reply: "Invalid request." });
    }

    const text = message.toLowerCase().trim();

    const session =
      sessions.get(conversationId) || {
        orders: [],
        activeOrders: [],
        pastOrders: [],
        selectedOrder: null
      };

    /*
      =====================================================
      1️⃣ ORDER NUMBER SELECTION
      =====================================================
    */
    const orderNumberMatch = text.match(/^\s*#?(\d{1,6})\s*$/);

    if (orderNumberMatch && session.activeOrders.length) {
      const entered = orderNumberMatch[1];
      const found = session.activeOrders.find(
        o => o.name?.replace("#", "") === entered
      );

      if (found) {
        session.selectedOrder = found;
        sessions.set(conversationId, session);
        return res.json({ reply: buildOrderStatus(found) });
      }

      return res.json({
        reply: `That doesn’t match an active order. Please choose from ${session.activeOrders
          .map(o => o.name)
          .join(", ")}`
      });
    }

    /*
      =====================================================
      2️⃣ LATEST ORDER
      =====================================================
    */
    if (isLatestOrderIntent(text) && session.activeOrders.length) {
      session.selectedOrder = session.activeOrders[0];
      sessions.set(conversationId, session);
      return res.json({ reply: buildOrderStatus(session.selectedOrder) });
    }

    /*
      =====================================================
      3️⃣ FOLLOW-UPS
      =====================================================
    */
    if (session.selectedOrder && isShipmentFollowUp(text)) {
      return res.json({
        reply: enrichOrderStatus(session.selectedOrder)
      });
    }

    /*
      =====================================================
      4️⃣ CANCELLATION
      =====================================================
    */
    if (session.selectedOrder && isCancelIntent(text)) {
      if (canCancel(session.selectedOrder)) {
        return res.json({
          reply:
            "This order hasn’t shipped yet, so it can still be cancelled. Would you like me to help you with that?"
        });
      }

      return res.json({
        reply:
          "This order has already shipped, so it can’t be cancelled. You can request a return once it’s delivered."
      });
    }

    /*
      =====================================================
      5️⃣ RETURNS
      =====================================================
    */
    if (session.selectedOrder && isReturnIntent(text)) {
      if (canReturn(session.selectedOrder)) {
        return res.json({
          reply:
            "This order is eligible for return. You can initiate a return from your account or I can guide you through the steps."
        });
      }

      return res.json({
        reply:
          "This order isn’t eligible for return yet. Returns are available after delivery."
      });
    }

    /*
      =====================================================
      6️⃣ TRACK / LIST ORDERS
      =====================================================
    */
    const isTrackIntent =
      text.includes("track") ||
      text.includes("where is") ||
      text.includes("order status") ||
      text.includes("my order") ||
      text.includes("list my orders");

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
            "You don’t have any active orders. Would you like to see your past orders or browse our latest products?"
        });
      }

      if (session.activeOrders.length === 1) {
        session.selectedOrder = session.activeOrders[0];
        sessions.set(conversationId, session);
        return res.json({
          reply: buildOrderStatus(session.selectedOrder)
        });
      }

      sessions.set(conversationId, session);
      return res.json({
        reply: `I see ${session.activeOrders.length} active orders: ${session.activeOrders
          .map(o => o.name)
          .join(", ")}. Which one would you like to check?`
      });
    }

    return res.json({
      reply:
        "I can help with order tracking, cancellations, returns, or delivery updates."
    });
  } catch (err) {
    console.error(err);
    return res.json({
      reply: "Sorry, something went wrong while handling your request."
    });
  }
}

/*
  =====================================================
  SHOPIFY API
  =====================================================
*/
async function fetchOrders(email) {
  const store = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;

  const res = await fetch(
    `https://${store}/admin/api/2024-01/orders.json?status=any&email=${encodeURIComponent(
      email
    )}`,
    {
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json"
      }
    }
  );

  const data = await res.json();
  return (data.orders || []).sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
}

/*
  =====================================================
  HELPERS
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

function buildOrderStatus(order) {
  const items = order.line_items
    .map(i => `${i.quantity} × ${i.title}`)
    .join(", ");

  return `Your order ${order.name} includes ${items}. ${enrichOrderStatus(
    order
  )}`;
}

function enrichOrderStatus(order) {
  const f = order.fulfillments?.[0];

  if (!f) {
    return "It’s being prepared for shipment. You’ll receive tracking details once it’s dispatched.";
  }

  let reply = `Current status: ${humanizeStatus(
    f.status || order.fulfillment_status
  )}. `;

  if (f.tracking_company) reply += `Carrier: ${f.tracking_company}. `;
  if (f.tracking_number) reply += `Tracking number: ${f.tracking_number}. `;
  if (f.tracking_urls?.[0])
    reply += `Track here: ${f.tracking_urls[0]} `;

  if (f.estimated_delivery_at) {
    reply += `Estimated delivery: ${new Date(
      f.estimated_delivery_at
    ).toLocaleDateString()}.`;
  }

  return reply;
}

function canCancel(order) {
  return !order.fulfillments?.length;
}

function canReturn(order) {
  return order.fulfillment_status === "fulfilled";
}

function isLatestOrderIntent(text) {
  return text.includes("latest") || text.includes("recent") || text.includes("last");
}

function isShipmentFollowUp(text) {
  return (
    text.includes("where is it") ||
    text.includes("has it shipped") ||
    text.includes("delivery")
  );
}

function isCancelIntent(text) {
  return text.includes("cancel");
}

function isReturnIntent(text) {
  return text.includes("return");
}

function humanizeStatus(status) {
  switch (status) {
    case "unfulfilled":
      return "being prepared";
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
