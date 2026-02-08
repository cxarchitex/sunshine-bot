export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Method not allowed." });
  }

  try {
    const { message, state = {}, customer } = req.body;

    const intent = state.intent;
    const email =
      customer?.email ||
      state.email ||
      null;

    // Ask for email only if needed
    if (
      (intent === "LIST_ORDERS" || intent === "TRACK_ORDER") &&
      !email
    ) {
      return res.json({
        reply: "Please share the email used for your orders."
      });
    }

    // LIST ORDERS
    if (intent === "LIST_ORDERS") {
      const orders = await fetchOrdersByEmail(email);

      if (!orders.length) {
        return res.json({
          reply: "I couldn’t find any orders for that email."
        });
      }

      const reply = orders.slice(0, 5).map(o => (
        `#${o.order_number}
Payment: ${o.financial_status}
Fulfillment: ${o.fulfillment_status || "unfulfilled"}`
      )).join("\n\n");

      return res.json({ reply });
    }

    // TRACK ORDER
    if (intent === "TRACK_ORDER") {
      const match = message.match(/#?\d{3,}/);
      if (!match) {
        return res.json({
          reply: "Please share your order number. Example: #1042"
        });
      }

      const order = await fetchOrderByNumber(match[0].replace("#", ""));
      if (!order) {
        return res.json({
          reply: "I couldn’t find that order."
        });
      }

      return res.json({
        reply: `Order #${order.order_number}
Payment: ${order.financial_status}
Fulfillment: ${order.fulfillment_status || "unfulfilled"}`
      });
    }

    return res.json({
      reply: "I can help with tracking orders or listing your orders."
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      reply: "Something went wrong."
    });
  }
}

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

async function fetchOrdersByEmail(email) {
  const res = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/2023-10/orders.json?email=${encodeURIComponent(
      email
    )}&status=any`,
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN
      }
    }
  );
  const data = await res.json();
  return data.orders || [];
}

async function fetchOrderByNumber(number) {
  const res = await fetch(
    `https://${SHOPIFY_DOMAIN}/admin/api/2023-10/orders.json?name=%23${number}&status=any`,
    {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_TOKEN
      }
    }
  );
  const data = await res.json();
  return data.orders?.[0] || null;
}
