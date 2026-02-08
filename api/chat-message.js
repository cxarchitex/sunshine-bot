export default async function handler(req, res) {
  /* -----------------------------
     CORS (required for Shopify)
  ----------------------------- */
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Method not allowed." });
  }

  /* -----------------------------
     Request body
  ----------------------------- */
  const { message, conversationId, customer } = req.body || {};

  if (!message || !conversationId) {
    return res.status(400).json({ reply: "Invalid request." });
  }

  /* -----------------------------
     Session memory (per conversation)
  ----------------------------- */
  global.sessions ||= {};

  const session =
    global.sessions[conversationId] ||= {
      intent: null,
      email: null
    };

  const text = message.toLowerCase();

  /* -----------------------------
     Auto-hydrate email for logged-in users
  ----------------------------- */
  if (!session.email && customer?.loggedIn && customer?.email) {
    session.email = customer.email;
  }

  /* -----------------------------
     Capture email if user typed it
  ----------------------------- */
  const emailMatch = message.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
  );
  if (!session.email && emailMatch) {
    session.email = emailMatch[0];
  }

  /* -----------------------------
     Intent detection
  ----------------------------- */
  const wantsTracking =
    /track|where.*order|order status|my order|package/i.test(text);

  const wantsList =
    /list|my orders|past orders|order history/i.test(text);

  if (wantsTracking) {
    session.intent = "TRACK_ORDER";
  } else if (wantsList) {
    session.intent = "LIST_ORDERS";
  }

  /* -----------------------------
     TRACK ORDER
  ----------------------------- */
  if (session.intent === "TRACK_ORDER") {
    if (!session.email) {
      return res.json({
        reply: "Please share the email used for your order."
      });
    }

    try {
      const orders = await fetchOrdersByEmail(session.email);

      if (!orders.length) {
        return res.json({
          reply:
            "I couldn’t find any orders for that email. Please double-check it."
        });
      }

      const activeOrder = orders.find(
        (o) =>
          !o.cancelled_at &&
          (o.fulfillment_status === null ||
            o.fulfillment_status === "unfulfilled" ||
            o.fulfillment_status === "partial")
      );

      if (!activeOrder) {
        return res.json({
          reply:
            "You don’t have any active orders right now. Would you like to see your past orders?"
        });
      }

      const fulfillment = activeOrder.fulfillments?.[0];
      const trackingUrl = fulfillment?.tracking_url;

      let reply = `Your order ${activeOrder.name} is currently `;

      if (!activeOrder.fulfillment_status) {
        reply += "being prepared for shipment.";
      } else if (activeOrder.fulfillment_status === "partial") {
        reply += "partially shipped.";
      } else {
        reply += "shipped.";
      }

      if (trackingUrl) {
        reply += ` You can track it here: ${trackingUrl}`;
      }

      return res.json({ reply });
    } catch (err) {
      console.error("Shopify order fetch error:", err);
      return res.json({
        reply: "Sorry, I couldn’t fetch your order right now."
      });
    }
  }

  /* -----------------------------
     LIST ORDERS
  ----------------------------- */
  if (session.intent === "LIST_ORDERS") {
    if (!session.email) {
      return res.json({
        reply: "Please share the email used for your orders."
      });
    }

    try {
      const orders = await fetchOrdersByEmail(session.email);

      if (!orders.length) {
        return res.json({
          reply: "I couldn’t find any orders for that email."
        });
      }

      const summary = orders
        .slice(0, 5)
        .map(
          (o) =>
            `${o.name} • ${o.financial_status} • ${
              o.fulfillment_status || "processing"
            }`
        )
        .join("\n");

      return res.json({
        reply: `Here are your recent orders:\n${summary}`
      });
    } catch (err) {
      console.error("Shopify list orders error:", err);
      return res.json({
        reply: "Sorry, I couldn’t fetch your orders right now."
      });
    }
  }

  /* -----------------------------
     Default fallback
  ----------------------------- */
  return res.json({
    reply:
      "Hi 👋 I can help you track your order, list your orders, or check order status."
  });
}

/* =====================================================
   Shopify Admin API helper
===================================================== */

async function fetchOrdersByEmail(email) {
  const store = process.env.SHOPIFY_STORE_DOMAIN;
  const token = process.env.SHOPIFY_ADMIN_TOKEN;

  if (!store || !token) {
    throw new Error("Shopify environment variables missing");
  }

  const url = `https://${store}/admin/api/2024-01/orders.json?email=${encodeURIComponent(
    email
  )}&status=any&limit=10`;

  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": token,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error("Shopify API request failed");
  }

  const data = await res.json();
  return data.orders || [];
}
