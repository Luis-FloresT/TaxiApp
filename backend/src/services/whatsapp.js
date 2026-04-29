const axios = require('axios');
const { cleanEnv } = require('../config/env');

const canUseMetaApi = () =>
  cleanEnv(process.env.WA_ACCESS_TOKEN) &&
  cleanEnv(process.env.WA_ACCESS_TOKEN) !== 'pending' &&
  cleanEnv(process.env.WA_PHONE_ID) &&
  cleanEnv(process.env.WA_PHONE_ID) !== 'pending';

const sendWhatsAppText = async (to, text) => {
  if (!canUseMetaApi()) {
    console.log(`📤 [SIMULADO] WhatsApp a ${to}:\n${text}`);
    return { simulated: true };
  }

  await axios.post(
    `https://graph.facebook.com/v18.0/${cleanEnv(process.env.WA_PHONE_ID)}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    },
    {
      headers: {
        Authorization: `Bearer ${cleanEnv(process.env.WA_ACCESS_TOKEN)}`
      }
    }
  );

  return { simulated: false };
};

module.exports = { canUseMetaApi, sendWhatsAppText };
