import { handleChatMessage } from './chat-message';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const event = req.body;

    const messageText =
      event?.events?.[0]?.payload?.text || '';

    const conversationId =
      event?.events?.[0]?.conversation?.id;

    const metadata =
      event?.events?.[0]?.conversation?.metadata || {};

    const intent = detectIntent(messageText);

    const result = await handleChatMessage({
      intent,
      message: messageText,
      conversationId,
      metadata
    });

    return res.json({
      reply: result.reply,
      metadata_update: result.metadata_update || null
    });
  } catch (err) {
    console.error('Sunshine webhook error', err);
    return res.status(500).end();
  }
}

/* ===============================
   SIMPLE INTENT DETECTION
   =============================== */
function detectIntent(text) {
  if (!text) return 'fallback';

  const lower = text.toLowerCase();

  if (lower.includes('list') && lower.includes('order')) {
    return 'list_orders';
  }

  if (lower.includes('@')) {
    return 'provide_email';
  }

  return 'fallback';
}
