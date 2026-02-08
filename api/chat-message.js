import { getOrdersByEmail } from './shopify';
import { extractEmail } from './utils';

export default async function handler(req, res) {
  /* ===============================
     CORS HEADERS (MUST BE FIRST)
     =============================== */
  res.setHeader('Access-Control-Allow-Origin', 'https://cx-demostore.myshopify.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      intent,
      message,
      conversationId,
      metadata = {}
    } = req.body;

    const customerEmail = metadata.customer_email || null;

    /* ===============================
       LIST ORDERS
       =============================== */
    if (intent === 'list_orders') {
      if (!customerEmail) {
        return res.json({
          reply: 'Sure, please share the email used for your order.',
          next_step: 'collect_email'
        });
      }

      const orders = await getOrdersByEmail(customerEmail);

      if (!orders.length) {
        return res.json({
          reply: `I couldn’t find any orders for ${customerEmail}.`
        });
      }

      return res.json({
        reply: formatOrders(orders)
      });
    }

    /* ===============================
       COLLECT EMAIL
       =============================== */
    if (intent === 'provide_email') {
      const email = extractEmail(message);

      if (!email) {
        return res.json({
          reply: 'Please enter a valid email address.'
        });
      }

      const orders = await getOrdersByEmail(email);

      return res.json({
        reply: orders.length
          ? formatOrders(orders)
          : `I couldn’t find any orders for ${email}.`,
        metadata_update: {
          customer_email: email
        }
      });
    }

    /* ===============================
       FALLBACK
       =============================== */
    return res.json({
      reply: 'How can I help you today?'
    });
  } catch (err) {
    console.error('chat-message error', err);
    return res.status(500).json({
      reply: 'Something went wrong. Please try again.'
    });
  }
}

/* ===============================
   HELPERS
   =============================== */
function formatOrders(orders) {
  return orders
    .slice(0, 5)
    .map(o => {
      return (
        `Order ${o.name}\n` +
        `Placed on ${new Date(o.created_at).toDateString()}\n` +
        `Status: ${o.financial_status}`
      );
    })
    .join('\n\n');
}
