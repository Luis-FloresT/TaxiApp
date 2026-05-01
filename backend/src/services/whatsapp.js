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

const trySendWhatsAppText = async (to, text) => {
  try {
    const result = await sendWhatsAppText(to, text);
    return { ok: true, ...result };
  } catch (error) {
    const metaError = error.response?.data?.error;
    console.error(
      `⚠️ WhatsApp no pudo enviar a ${to}:`,
      metaError?.message || error.message
    );
    return {
      ok: false,
      simulated: false,
      error: metaError?.message || error.message,
      code: metaError?.code || null
    };
  }
};

module.exports = { canUseMetaApi, sendWhatsAppText, trySendWhatsAppText };
