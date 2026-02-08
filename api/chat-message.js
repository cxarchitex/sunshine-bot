export default async function handler(req, res) {
  // -------------------------------
  // CORS (REQUIRED FOR SHOPIFY)
  // -------------------------------
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
    const { message, sessionId } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ error: 'Missing message or sessionId' });
    }

    // -------------------------------
    // SIMPLE LOGIC (PLACEHOLDER)
    // -------------------------------
    let reply = 'Hi 👋 How can I help you today?';

    if (/track.*order/i.test(message)) {
      reply = 'Sure 🙂 Please share your order number.';
    }

    if (/cart/i.test(message)) {
      reply = 'Your cart is currently empty. Would you like help finding a product?';
    }

    res.status(200).json({
      reply,
      sessionId
    });

  } catch (err) {
    console.error('CHAT MESSAGE ERROR:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
