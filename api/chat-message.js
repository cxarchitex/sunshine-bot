import fetch from "node-fetch";

/* -----------------------------
   Simple in-memory session store
-------------------------------- */
const sessions = {};

/* -----------------------------
   Intent detection
-------------------------------- */
function detectIntent(message, context, session) {
  const text = message.toLowerCase();

  // Continuation has highest priority
  if (session.awaitingOrderNumber && /\d{3,}/.test(text)) {
    return "order_number_provided";
  }

  if (/track|where.*order|order status/.test(text)) return "track_order";
  if (/cancel.*order/.test(text)) return "cancel_order";
  if (/return|refund/.test(text)) return "return_order";
  if (/cart|my cart|what.*cart/.test(text)) return "cart_status";

  if (context.product && text.length < 20) return "product_query";

  return "fallback";
}

/* -----------------------------
   Helpers
-------------------------------- */
function extractOrderNumber(text) {
  const match = text.match(/\d{3,}/);
  return match ? match[0] : null;
}

function capabilityReply(context) {
  if (context.cart && context.cart.item_count > 0) {
    return "I can help review your cart or guide you to checkout.";
  }

  if (context.product) {
    return "I can help with product details or adding this item to your cart.";
  }

  return "I can help track an order, check your cart, or find a product.";
}

function handleProductQuery(context) {
  const p = context.product;
  return `You're viewing ${p.title}, priced at ₹${p.price / 100}. Would you like details, compatibility info, or to add it to your cart?`;
}

/* -----------------------------
   Shopify order lookup
-------------------------------- */
async function fetchOrderByNumber(orderNumber) {
  const url = `https://${process.env.SHOPIFY_STORE}/admin/api/2023-10/orders.json?name=${orderNumber}`;

  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
      "Content-Type": "application/json"
    }
  });

  const data = await res.json();
  return data.orders && data.orders.length ? data.orders[0] : null;
}

/* -----------------------------
   Main handler
-------------------------------- */
export default async function handler(req, res) {
  try {
    const body = req.body || {};
    const message = body.message || "";
    const context = body.context || {};
    const sessionId = body.session_id;

    if (!sessionId) {
      return res.status(400).json({ reply: "Session missing." });
    }

    if (!sessions[sessionId]) {
      sessions[sessionId] = {
        awaitingOrderNumber: false,
        lastIntent: null
      };
    }

    const session = sessions[sessionId];
    const intent = detectIntent(message, context, session);

    let reply = "";

    switch (intent) {
      case "track_order":
        session.awaitingOrderNumber = true;
        reply = "Sure 🙂 Please share your order number.";
        break;

      case "order_number_provided": {
        const orderNumber = extractOrderNumber(message);
        session.awaitingOrderNumber = false;

        const order = await fetchOrderByNumber(orderNumber);

        if (!order) {
          reply = `I couldn’t find an order with number ${orderNumber}. Please double-check it.`;
        } else {
          reply = `Your order ${order.name} is currently ${order.fulfillment_status || "being processed"}.`;
        }
        break;
      }

      case "cart_status":
        if (context.cart && context.cart.item_count > 0) {
          reply = `You have ${context.cart.item_count} item(s) in your cart. Would you like to review or checkout?`;
        } else {
          reply = "Your cart is currently empty. Would you like help finding a product?";
        }
        break;

      case "product_query":
        reply = handleProductQuery(context);
        break;

      default:
        reply = capabilityReply(context);
    }

    session.lastIntent = intent;
    res.status(200).json({ reply });
  } catch (err) {
    console.error("CHAT MESSAGE ERROR:", err);
    res.status(500).json({ reply: "Something went wrong. Please try again." });
  }
}
