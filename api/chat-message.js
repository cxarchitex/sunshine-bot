function buildOrderStatus(order) {
  const fulfillment = order.fulfillments?.[0];
  const status = fulfillment?.status || order.fulfillment_status;

  // Case 1: Not shipped yet
  if (!fulfillment) {
    return `Your order ${order.name} is currently being prepared for shipment. It hasn’t shipped yet, but it’s in progress. You’ll receive tracking details as soon as it’s dispatched.`;
  }

  let reply = `Your order ${order.name} is currently ${humanizeStatus(status)}.`;

  if (fulfillment.tracking_company) {
    reply += ` It’s being shipped via ${fulfillment.tracking_company}.`;
  }

  if (fulfillment.tracking_number) {
    reply += ` Tracking number: ${fulfillment.tracking_number}.`;
  }

  if (fulfillment.tracking_urls?.[0]) {
    reply += ` You can track it here: ${fulfillment.tracking_urls[0]}`;
  }

  if (fulfillment.estimated_delivery_at) {
    reply += ` Estimated delivery: ${new Date(
      fulfillment.estimated_delivery_at
    ).toLocaleDateString()}.`;
  }

  return reply;
}
