export async function getOrdersByEmail(email) {
  const url =
    `https://${process.env.SHOPIFY_STORE_DOMAIN}` +
    `/admin/api/2024-01/orders.json` +
    `?email=${encodeURIComponent(email)}` +
    `&status=any&limit=5`;

  const response = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    console.error('Shopify API error', await response.text());
    return [];
  }

  const data = await response.json();
  return data.orders || [];
}
