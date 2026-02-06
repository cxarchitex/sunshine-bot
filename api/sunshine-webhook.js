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

    // Only handle real user messages
    if (trigger !== 'conversation:message') {
      return res.status(200).end();
    }

    if (message?.author?.type !== 'user') {
      return res.status(200).end();
    }

    const userText = message?.content?.text?.trim();
    console.log('SUNSHINE USER MESSAGE:', userText);

    // STEP 1: Take control immediately (critical)
    await acceptBotControl(appId, conversationId);

    // STEP 2: Immediate acknowledgement (prevents fallback)
    await sendSunshineReply(
      appId,
      conversationId,
      'Got it 👍 Let me help you with that.'
    );

    let finalReply = null;

    // STEP 3: Intent handling
    if (/order|track|tracking/i.test(userText)) {
      finalReply = 'Please share your order number.';
    }

    // STEP 4: Order number handling
    else if (/^#?\d{4,}$/i.test(userText)) {
      const orderNumber = userText.replace('#', '');
      const order = await getShopifyOrder(orderNumber);

      if (!order) {
        finalReply =
          `Sorry, I could not find order ${orderNumber}. ` +
          `Please double-check the number or ask to speak to an agent.`;
      } else {
        const fulfillment = order.fulfillments?.[0];
        const tracking = fulfillment?.tracking_numbers?.[0];

        if (tracking) {
          finalReply =
            `Order #${order.order_number} has been shipped.\n` +
            `Tracking number: ${tracking}`;
        } else {
          finalReply =
            `Order #${order.order_number} is being processed.\n` +
            `Tracking details will be shared once it ships.`;
        }
      }
    }

    // STEP 5: Send final reply if needed
    if (finalReply) {
      await sendSunshineReply(appId, conversationId, finalReply);
    }

    return res.status(200).end();
  } catch (error) {
    console.error('SUNSHINE WEBHOOK ERROR:', error);
    return res.status(500).end();
  }
}

/* ---------------- HELPERS ---------------- */

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

async function getShopifyOrder(orderNumber) {
  const url =
    `https://${process.env.SHOPIFY_SHOP_DOMAIN}` +
    `/admin/api/2024-01/orders.json?name=${orderNumber}&status=any`;

  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();
  return data?.orders?.[0];
}
