import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).end();
  }

  const event = req.body;

  const message = event?.event?.message?.content?.text;
  const role = event?.event?.message?.author?.role;
  const conversationId = event?.event?.conversation?.id;

  if (role !== "end_user") {
    return res.status(200).end();
  }

  console.log("User said:", message);

  await axios.post(
    `https://api.smooch.io/v2/apps/${process.env.SUNSHINE_APP_ID}/conversations/${conversationId}/messages`,
    {
      role: "appMaker",
      type: "text",
      text: "Hi 👋 I am connected. Please share your order number."
    },
    {
      auth: {
        username: process.env.SUNSHINE_KEY_ID,
        password: process.env.SUNSHINE_SECRET
      }
    }
  );

  res.status(200).end();
}
