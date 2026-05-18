const axios = require('axios');
const { cleanEnv } = require('../config/env');
const { getDefaultWhatsAppNumber, getWhatsAppNumberById } = require('./whatsappNumbers');

const canUseMetaApi = (line = null) => {
  const token = cleanEnv(line?.access_token || process.env.WA_ACCESS_TOKEN);
  const phoneNumberId = cleanEnv(line?.phone_number_id || process.env.WA_PHONE_ID);

  return Boolean(token && token !== 'pending' && phoneNumberId && phoneNumberId !== 'pending');
};

const resolveLine = async (options = {}) => {
  if (options.line) return options.line;
  if (options.whatsappNumberId) return getWhatsAppNumberById(options.whatsappNumberId);
  return getDefaultWhatsAppNumber();
};

const sendWhatsAppText = async (to, text, options = {}) => {
  const line = await resolveLine(options);

  if (!canUseMetaApi(line)) {
    console.log(`📤 [SIMULADO] WhatsApp a ${to}:\n${text}`);
    return { simulated: true };
  }

  const phoneNumberId = cleanEnv(line?.phone_number_id || process.env.WA_PHONE_ID);
  const accessToken = cleanEnv(line?.access_token || process.env.WA_ACCESS_TOKEN);

  await axios.post(
    `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  return { simulated: false, whatsapp_number_id: line?.id || null, phone_number_id: phoneNumberId };
};

const trySendWhatsAppText = async (to, text, options = {}) => {
  try {
    const result = await sendWhatsAppText(to, text, options);
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
