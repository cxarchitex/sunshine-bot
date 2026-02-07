// /api/sunshine-webhook.js
// Uses native fetch (Node 18+, Vercel default)

export default async function handler(req, res) {
  try {
    const body = req.body || {};

    const trigger = body.trigger;
    const appId = body?.app?.id;
    const conversationId = body?.conversation?.id;
    const message = body?.messages?.[0];

    console.log("SUNSHINE EVENT:", trigger, appId, conversationId);

    // Ignore non-conversation pings
    if (!appId || !conversationId) {
      return res.status(200).end();
    }

    // 🔑 STEP 1: TAKE CONTROL (CRITICAL)
    await acceptControl(appId, conversationId);
    console.log("CONTROL ACCEPTED:", conversationId);

    // Only react to real user messages
    if (!message || message.author?.type !== "user") {
      return res.status(200).end();
    }

    const userText = message.content?.text?.trim();
    console.log("USER MESSAGE:", userText);

    let reply = null;

    // STEP 2: INTENT — ORDER TRACKING
    if (/order|track|tracking/i.test(userText)) {
      reply = "Sure. Please share your order number.";
    }

    // STEP 3: ORDER NUMBER HANDLING
    else if (/^#?\d{4,}$/.test(userText)) {
      const orderNumber = userText.replace("#", "");
      const order = await getShopifyOrder(orderNumber);

      if (!order) {
        reply =
          `Sorry, I could not find order ${orderNumber}. ` +
          `Please double-check the number or ask for a human agent.`;
      } else {
        const fulfillment = order.fulfillments?.[0];
        const tracking = fulfillment?.tracking_numbers?.[0];

        if (tracking) {
          reply =
            `Order #${order.order_number} has shipped.\n` +
            `Tracking number: ${tracking}`;
        } else {
          reply =
            `Order #${order.order_number} is being processed.\n` +
            `Tracking details will be shared once it ships.`;
        }
      }
    }

    // STEP 4: SEND BOT REPLY (ONLY AFTER CONTROL)
    if (reply) {
      await sendMessage(appId, conversationId, reply);
    }

    return res.status(200).end();
  } catch (error) {
    console.error("SUNSHINE WEBHOOK ERROR:", error);
    return res.status(500).end();
  }
}

/* ---------------- HELPERS ---------------- */

async function acceptControl(appId, conversationId) {
  await fetch(
    `https://api.smooch.io/v2/apps/${appId}/conversations/${conversationId}/acceptControl`,
    {
      method: "POST",
      headers: {
        Authorization:
          "Basic " +
          Buffer.from(
            `${process.env.SUNSHINE_KEY_ID}:${process.env.SUNSHINE_KEY_SECRET}`
          ).toString("base64"),
      },
    }
  );
}

async function sendMessage(appId, conversationId, text) {
  await fetch(
    `https://api.smooch.io/v2/apps/${appId}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " +
          Buffer.from(
            `${process.env.SUNSHINE_KEY_ID}:${process.env.SUNSHINE_KEY_SECRET}`
          ).toString("base64"),
      },
      body: JSON.stringify({
        author: { type: "business" },
        content: { type: "text", text },
      }),
    }
  );
}

async function getShopifyOrder(orderNumber) {
  const url =
    `https://${process.env.SHOPIFY_STORE_DOMAIN}` +
    `/admin/api/2024-01/orders.json?name=${orderNumber}&status=any`;

  const response = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();
  return data?.orders?.[0];
}
