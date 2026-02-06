// /api/sunshine-webhook.js

export default async function handler(req, res) {
  // Sunshine sends HEAD requests for validation
  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const body = req.body;

    const trigger = body?.trigger;
    const conversationId = body?.conversation?.id;
    const appId = body?.app?.id;
    const message = body?.messages?.[0];

    // Only process real user messages
    if (trigger !== 'conversation:message') {
      return res.status(200).end();
    }

    if (message?.author?.type !== 'user') {
      return res.status(200).end();
    }

    const userText = message?.content?.text?.trim();

    console.log('SUNSHINE USER MESSAGE:', userText, conversationId);

    let replyText = 'Hi 👋 How can I help you today?';

    if (userText?.toLowerCase().includes('order')) {
      replyText = 'Sure, please share your order number.';
    }

    // Native fetch (Node 18+)
    await fetch(
      `https://api.smooch.io/v2/apps/${appId}/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:
            'Basic ' +
            Buffer.from(
              `${process.env.SUNSHINE_KEY_ID}:${process.env.SUNSHINE_KEY_SECRET}`
            ).toString('base64'),
        },
        body: JSON.stringify({
          author: { type: 'business' },
          content: {
            type: 'text',
            text: replyText,
          },
        }),
      }
    );

    return res.status(200).end();
  } catch (error) {
    console.error('SUNSHINE WEBHOOK ERROR:', error);
    return res.status(500).end();
  }
}
