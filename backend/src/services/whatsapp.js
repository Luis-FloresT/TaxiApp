const axios = require('axios');

const canUseMetaApi = () =>
  process.env.WA_ACCESS_TOKEN &&
  process.env.WA_ACCESS_TOKEN !== 'pending' &&
  process.env.WA_PHONE_ID &&
  process.env.WA_PHONE_ID !== 'pending';

const sendWhatsAppText = async (to, text) => {
  if (!canUseMetaApi()) {
    console.log(`📤 [SIMULADO] WhatsApp a ${to}:\n${text}`);
    return { simulated: true };
  }

  await axios.post(
    `https://graph.facebook.com/v18.0/${process.env.WA_PHONE_ID}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}`
      }
    }
  );

  return { simulated: false };
};

module.exports = { canUseMetaApi, sendWhatsAppText };
