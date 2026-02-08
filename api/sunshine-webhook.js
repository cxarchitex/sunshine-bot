export default async function handler(req, res) {
  const body = req.body || {};

  const appId = body?.app?.id;
  const conversationId = body?.conversation?.id;
  const message = body?.messages?.[0];

  if (!appId || !conversationId) {
    return res.status(200).end();
  }

  await acceptControl(appId, conversationId);

  if (!message || message.author?.type !== "user") {
    return res.status(200).end();
  }

  const text = message.content?.text?.trim();

  let reply = "Hi 👋 How can I help you today?";
  if (/order|track/i.test(text)) {
    reply = "Please share your order number.";
  }

  await sendMessage(appId, conversationId, reply);
  res.status(200).end();
}

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
          ).toString("base64")
      }
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
          ).toString("base64")
      },
      body: JSON.stringify({
        author: { type: "business" },
        content: { type: "text", text }
      })
    }
  );
}
