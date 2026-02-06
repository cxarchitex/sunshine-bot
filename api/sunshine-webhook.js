// /api/sunshine-webhook.js

export default async function handler(req, res) {
  try {
    const body = req.body || {};

    const trigger = body.trigger;
    const conversationId = body?.conversation?.id;
    const appId = body?.app?.id;
    const messages = body?.messages;

    console.log('================ SUNSHINE EVENT ================');
    console.log('Trigger:', trigger);
    console.log('Conversation ID:', conversationId);
    console.log('App ID:', appId);

    if (messages && messages.length > 0) {
      console.log(
        'Message author type:',
        messages[0]?.author?.type
      );
      console.log(
        'Message text:',
        messages[0]?.content?.text
      );
    } else {
      console.log('No messages array in payload');
    }

    console.log('================================================');

    return res.status(200).end();
  } catch (error) {
    console.error('SUNSHINE WEBHOOK ERROR:', error);
    return res.status(500).end();
  }
}
