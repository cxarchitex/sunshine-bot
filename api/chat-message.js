export default async function handler(req, res) {
  // ---------- CORS (Shopify safe) ----------
  res.setHeader(
    'Access-Control-Allow-Origin',
    'https://cx-demostore.myshopify.com'
  );
  res.setHeader(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, sessionId, context = {} } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({
        error: 'Missing message or sessionId'
      });
    }

    const text = message.toLowerCase().trim();
    let reply = '';
    let updatedContext = { ...context };

    // ----------------------------
    // INTENT: TRACK ORDER
    // ----------------------------
    if (/track.*order|order status|check.*order/.test(text)) {
      reply = 'Sure 🙂 Please share your order number.';
      updatedContext.expectingOrderNumber = true;
    }

    // ----------------------------
    // ORDER NUMBER PROVIDED
    // ----------------------------
    else if (/^\d{3,}$/.test(text)) {
      if (context.expectingOrderNumber) {
        reply = `Thanks 🙂 I’m checking order #${text}. Please hold on.`;
        updatedContext.expectingOrderNumber = false;
        updatedContext.lastOrderNumber = text;
      } else {
        reply = `I received order number ${text}. What would you like to do with it?`;
      }
    }

    // ----------------------------
    // INTENT: CART
    // ----------------------------
    else if (/cart|my cart|what.*in.*cart/.test(text)) {
      reply = 'Your cart is currently empty. Would you like help finding a product?';
    }

    // ----------------------------
    // INTENT: PRODUCT HELP
    // ----------------------------
    else if (/product|recommend|suggest|help me buy/.test(text)) {
      reply = 'I can help you compare products, check availability, or add items to your cart.';
    }

    // ----------------------------
    // INTENT: RETURNS / CANCEL
    // ----------------------------
    else if (/cancel|refund|return/.test(text)) {
      reply = 'I can help with cancellations or returns. Please share your order number.';
      updatedContext.expectingOrderNumber = true;
    }

    // ----------------------------
    // INTENT: CAPABILITIES
    // ----------------------------
    else if (/what can you help|what do you do|help me with/.test(text)) {
      reply =
        'I can help with order tracking, cart details, product questions, cancellations, and returns.';
    }

    // ----------------------------
    // GREETING (ONLY ONCE PER SESSION)
    // ----------------------------
    else if (/^hi$|^hello$|^hey$/.test(text) && !context.greeted) {
      reply = 'Hi 👋 How can I help you today?';
      updatedContext.greeted = true;
    }

    // ----------------------------
    // FALLBACK
    // ----------------------------
    else {
      reply = 'Got it 👍 How can I help you next?';
    }

    return res.status(200).json({
      reply,
      context: updatedContext
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}
