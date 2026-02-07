const sessionConversationMap = new Map();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const { session_id, message } = req.body || {};

  if (!session_id || !message) {
    return res.status(400).json({ error: "Missing session_id or message" });
  }

  let conversationId = sessionConversationMap.get(session_id);

  if (!conversationId) {
    conversationId = await createConversation();
    sessionConversationMap.set(session_id, conversationId);
  }

  // Send user message into Sunshine
  await sendMessageToConversation(conversationId, message, "user");

  // Bot logic
  const reply = getBotReply(message);

  // Send bot reply into Sunshine
  await sendMessageToConversation(conversationId, reply, "bot");

  return res.json({ reply });
}

/* ================= HELPERS ================= */

function getBotReply(text = "") {
  if (/order|track/i.test(text)) {
    return "Please share your order number.";
  }

  if (/refund/i.test(text)) {
    return "I can help with refunds. Please share your order number.";
  }

  return "Hi, how can I help you today?";
}

async function createConversation() {
  const response = await fetch("https://api.smooch.io/v2/conversations", {
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
      type: "personal",
      participants: [{ role: "user" }],
    }),
  });

  const data = await response.json();
  return data.conversation.id;
}

async function sendMessageToConversation(conversationId, text, sender) {
  await fetch(
    `https://api.smooch.io/v2/conversations/${conversationId}/messages`,
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
        author:
          sender === "bot"
            ? { type: "business" }
            : { type: "user" },
        content: { type: "text", text },
      }),
    }
  );
}
