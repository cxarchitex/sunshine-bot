export default async function handler(req, res) {
  const body = req.body || {};

  const trigger = body.trigger;
  const appId = body?.app?.id;
  const conversationId = body?.conversation?.id;
  const message = body?.messages?.[0];

  console.log("SUNSHINE EVENT:", trigger, appId, conversationId);

  if (!appId || !conversationId) {
    return res.status(200).end();
  }

  // Take control once per conversation
  await acceptControl(appId, conversationId);

  if (!message || message.author?.type !== "user") {
    return res.status(200).end();
  }

  const text = message.content?.text?.trim();
  console.log("USER MESSAGE:", text);

  let reply = "Got it. I’m handling this.";

  if (/order|track/i.test(text)) {
    reply = "Please share your order number.";
  }

  await sendMessage(appId, conversationId, reply);

  res.status(200).end();
}

/* helpers */

async function acceptControl(appId, conversationId) {
  await fetch(
    `https://api.smooch.io/v2/apps/${appId}/conversations/${conversationId}/switchboard/accept`,
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
