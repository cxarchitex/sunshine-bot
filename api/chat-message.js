import { getOrdersByEmail } from './shopify';
import { extractEmail } from './utils';

export async function handleChatMessage({
  intent,
  message,
  conversationId,
  metadata = {}
}) {
  const customerEmail = metadata.customer_email || null;

  /* ===============================
     LIST ORDERS
     =============================== */
  if (intent === 'list_orders') {
    if (!customerEmail) {
      return {
        reply: 'Sure, please share the email used for your order.',
        next_step: 'collect_email'
      };
    }

    const orders = await getOrdersByEmail(customerEmail);

    if (!orders.length) {
      return {
        reply: `I couldn’t find any orders for ${customerEmail}.`
      };
    }

    return {
      reply: formatOrders(orders)
    };
  }

  /* ===============================
     COLLECT EMAIL
     =============================== */
  if (intent === 'provide_email') {
    const email = extractEmail(message);

    if (!email) {
      return {
        reply: 'Please enter a valid email address.'
      };
    }

    const orders = await getOrdersByEmail(email);

    return {
      reply: orders.length
        ? formatOrders(orders)
        : `I couldn’t find any orders for ${email}.`,
      metadata_update: {
        customer_email: email
      }
    };
  }

  /* ===============================
     FALLBACK
     =============================== */
  return {
    reply: 'How can I help you today?'
  };
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
