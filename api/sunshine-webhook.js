// /api/sunshine-webhook.js

export default async function handler(req, res) {
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

    if (trigger !== 'conversation:message') {
      return res.status(200).end();
    }

    if (message?.author?.type !== 'user') {
      return res.status(200).end();
    }

    const userText = message?.content?.text?.trim();

    // 🔍 SANITY CHECK LOG (THIS IS WHAT YOU ASKED FOR)
    console.log('ACCEPTING CONTROL FOR', conversationId, appId);

    // Try to accept control
    await acceptBotControl(appId, conversationId);

    // Immediate reply to avoid fallback
    await sendSunshineReply(
      appId,
      conversationId,
      'Bot received your message.'
    );

    return res.status(200).end();
  } catch (error) {
    console.error('SUNSHINE WEBHOOK ERROR:', error);
    return res.status(500).end();
  }
}

/* ------------ HELPERS ------------ */

async function acceptBotControl(appId, conversationId) {
  await fetch(
    `https://api.smooch.io/v2/apps/${appId}/conversations/${conversationId}/switchboard/accept`,
    {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(
            `${process.env.SUNSHINE_KEY_ID}:${process.env.SUNSHINE_KEY_SECRET}`
          ).toString('base64'),
      },
    }
  );
}

async function sendSunshineReply(appId, conversationId, text) {
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
        content: { type: 'text', text },
      }),
    }
  );
}
