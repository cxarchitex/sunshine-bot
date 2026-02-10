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
        selectedOrder: null
      };

    /*
      =====================================================
      1️⃣ ORDER NUMBER SELECTION (FIRST, ALWAYS)
      =====================================================
    */
    const orderNumberMatch = text.match(/^\s*#?(\d{1,6})\s*$/);

    if (orderNumberMatch && session.orders.length) {
      const entered = orderNumberMatch[1];

      const found = session.orders.find(o => {
        const nameNum = o.name?.replace("#", "");
        return nameNum === entered;
      });

      // ✅ Valid order selected
      if (found) {
        session.selectedOrder = found;
        sessions.set(conversationId, session);

        return res.json({
          reply: buildOrderStatus(found)
        });
      }

      // ❌ Invalid order number
      const validOrders = session.orders.map(o => o.name).join(", ");

      return res.json({
        reply: `That doesn’t look like one of your active orders. Please choose from: ${validOrders}`
      });
    }

    /*
      =====================================================
      2️⃣ TRACK ORDER INTENT
      =====================================================
    */
    const isTrackIntent =
      text.includes("track") ||
      text.includes("where is") ||
      text.includes("order status") ||
      text.includes("my order");

    if (isTrackIntent) {
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

        const numbers = activeOrders.map(o => o.name).join(", ");

        return res.json({
          reply: `I see ${activeOrders.length} active orders: ${numbers}. Which order would you like to know about?`
        });
      }

      // Guest user
      return res.json({
        reply: "Please share the email used for your order."
      });
    }

    /*
      =====================================================
      3️⃣ EMAIL CAPTURE (GUEST USERS)
      =====================================================
    */
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

      const numbers = activeOrders.map(o => o.name).join(", ");

      return res.json({
        reply: `I see ${activeOrders.length} active orders: ${numbers}. Which order would you like to know about?`
      });
    }

    /*
      =====================================================
      4️⃣ FOLLOW-UP QUESTIONS
      =====================================================
    */
    if (session.selectedOrder) {
      return res.json({
        reply: buildOrderStatus(session.selectedOrder)
      });
    }

    /*
      =====================================================
      FALLBACK
      =====================================================
    */
    return res.json({
      reply:
        "I can help you track your order, list orders, or check order status."
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

  // Sort newest first
  return (data.orders || []).sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
}

/*
  =====================================================
  ORDER RESPONSE FORMATTER
  =====================================================
*/
function buildOrderStatus(order) {
  const fulfillment = order.fulfillments?.[0];

  const orderName = order.name;
  const fulfillmentStatus = fulfillment?.status || order.fulfillment_status;
  const carrier = fulfillment?.tracking_company;
  const trackingNumber = fulfillment?.tracking_number;
  const trackingUrl = fulfillment?.tracking_urls?.[0];
  const eta = fulfillment?.estimated_delivery_at;
  const fulfilledAt = fulfillment?.fulfilled_at;

  let reply = `Your order ${orderName} is currently ${humanizeFulfillmentStatus(
    fulfillmentStatus
  )}.`;

  // Carrier
  if (carrier) {
    reply += ` It’s being shipped via ${carrier}.`;
  }

  // Tracking
  if (trackingNumber) {
    reply += ` Tracking number: ${trackingNumber}.`;
  }

  if (trackingUrl) {
    reply += ` You can track it here: ${trackingUrl}`;
  }

  // ETA handling
  if (eta) {
    const etaDate = new Date(eta).toLocaleDateString();
    reply += ` Estimated delivery: ${etaDate}.`;
  } else if (fulfilledAt) {
    const shipDate = new Date(fulfilledAt).toLocaleDateString();
    reply += ` It shipped on ${shipDate}.`;
  } else {
    reply += ` We’ll notify you as soon as it ships.`;
  }

  return reply;
}


function humanizeFulfillmentStatus(status) {
  switch (status) {
    case "pending":
      return "being prepared for shipment";
    case "open":
      return "ready to ship";
    case "in_transit":
      return "on the way";
    case "delivered":
      return "delivered";
    case "cancelled":
      return "cancelled";
    case "fulfilled":
      return "shipped";
    default:
      return status || "processing";
  }
}
