export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { message, customer } = req.body;
  const text = (message || "").toLowerCase();

  const intent = detectIntent(text);

  /* -----------------------------
     TRACK ORDER INTENT
  ------------------------------ */
  if (intent === "TRACK_ORDER") {
    // Not logged in and no email yet
    if (!customer?.loggedIn && !customer?.email) {
      return res.json({
        reply: "Please share the email used for your orders."
      });
    }

    // Fetch active orders (mock for now)
    const activeOrders = await getActiveOrders(customer);

    // No active orders
    if (activeOrders.length === 0) {
      return res.json({
        reply:
          "You don’t have any active orders right now. Would you like to check your past orders?"
      });
    }

    // Multiple active orders
   if (activeOrders.length > 1) {
  const orderNumbers = activeOrders
    .map(o => `#${o.number}`)
    .join(", ");

  return res.json({
    reply: `I see ${activeOrders.length} active orders: ${orderNumbers}. Which order would you like to know about?`
  });
}


    // Exactly one active order
    const order = activeOrders[0];
    return res.json({
      reply: `Your order #${order.number} is currently ${order.status}. You’ll receive it by ${order.delivery}.`
    });
  }

  /* -----------------------------
     LIST ORDERS INTENT
  ------------------------------ */
  if (intent === "LIST_ORDERS") {
    if (!customer?.loggedIn && !customer?.email) {
      return res.json({
        reply: "Please share the email used for your orders."
      });
    }

    const orders = await getAllOrders(customer);

    if (!orders.length) {
      return res.json({
        reply: "I couldn’t find any orders for you."
      });
    }

    return res.json({
      reply: orders
        .map(o => `#${o.number} – ${o.status}`)
        .join("\n")
    });
  }

  /* -----------------------------
     FALLBACK
  ------------------------------ */
  return res.json({
    reply:
      "I can help with tracking orders, listing orders, or checking products."
  });
}

/* -----------------------------
   INTENT DETECTION
------------------------------ */
function detectIntent(text) {
  if (
    text.includes("track") ||
    text.includes("where") ||
    text.includes("order status")
  ) {
    return "TRACK_ORDER";
  }

  if (text.includes("list") && text.includes("order")) {
    return "LIST_ORDERS";
  }

  return "UNKNOWN";
}

/* -----------------------------
   MOCK DATA (replace later)
------------------------------ */
async function getActiveOrders(customer) {
  // Example mock scenarios:
  return [
    {
      number: 1020,
      status: "being prepared for shipment",
      delivery: "Feb 14"
    },
    {
      number: 1023,
      status: "out for delivery",
      delivery: "Feb 10"
    }
  ];

  // To test no active orders, return []
  // To test single order, return [ { ... } ]
}

async function getAllOrders(customer) {
  return [
    { number: 1020, status: "Processing" },
    { number: 1015, status: "Delivered" }
  ];
}
