const sessionConversationMap = new Map();

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).end();
  }

  try {
    const { session_id, message } = req.body || {};

    if (!session_id || !message) {
      return res.status(400).json({
        error: "Missing session_id or message"
      });
    }

    let conversationId = sessionConversationMap.get(session_id);

    if (!conversationId) {
      conversationId = await createConversation();
      sessionConversationMap.set(session_id, conversationId);
    }

    await sendMessage(conversationId, message, "user");

    const reply = getBotReply(message);

    await sendMessage(conversationId, reply, "bot");

    return res.status(200).json({ reply });
  } catch (err) {
    console.error("CHAT MESSAGE ERROR:", err);
    return res.status(500).json({
      error: "Internal server error"
    });
  }
}

function getBotReply(text = "") {
  if (/order|track/i.test(text)) {
    return "Please share your order number.";
  }
  if (/refund/i.test(text)) {
    return "I can help with refunds. Please share your order number.";
  }
  return "Hi 👋 How can I help you today?";
}

async function createConversation() {
  const response = await fetch(
    `https://api.smooch.io/v2/apps/${process.env.SUNSHINE_APP_ID}/conversations`,
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
        type: "personal",
        participants: [{ role: "user" }]
      })
    }
  );

  const data = await response.json();

  if (!response.ok || !data?.conversation?.id) {
    throw new Error("Failed to create Sunshine conversation");
  }

  return data.conversation.id;
}

async function sendMessage(conversationId, text, sender) {
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
          ).toString("base64")
      },
      body: JSON.stringify({
        author: sender === "bot" ? { type: "business" } : { type: "user" },
        content: {
          type: "text",
          text
        }
      })
    }
  );
}
