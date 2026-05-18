const messageQueue = require('../queues/messageQueue');
const { cleanEnv } = require('../config/env');

const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === cleanEnv(process.env.WA_VERIFY_TOKEN)) {
    console.log('✅ Webhook verificado por Meta');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
};

const receiveMessage = async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
    const contact = change?.value?.contacts?.[0];
    const metadata = change?.value?.metadata || {};

    if (message) {
      let text = '';
      let messageType = message.type;

      // Texto normal
      if (message.type === 'text') {
        text = message.text.body;
      }

      // Ubicación compartida desde WhatsApp
      if (message.type === 'location') {
        const { latitude, longitude, name, address } = message.location;
        // Convertir ubicación a texto legible
        text = `📍 Ubicación compartida:\nLat: ${latitude}, Lng: ${longitude}`;
        if (name) text += `\nLugar: ${name}`;
        if (address) text += `\nDirección: ${address}`;
        // URL de Google Maps
        text += `\n🗺️ Ver en Maps: https://maps.google.com/?q=${latitude},${longitude}`;
      }

      // Contacto compartido
      if (message.type === 'contacts') {
        text = `📱 Contacto compartido: ${message.contacts[0]?.name?.formatted_name || 'Desconocido'}`;
      }

      // Imagen
      if (message.type === 'image') {
        text = '📷 [Imagen recibida]';
      }

      // Audio
      if (message.type === 'audio') {
        text = '🎵 [Audio recibido]';
      }

      // Video
      if (message.type === 'video') {
        text = '🎥 [Video recibido]';
      }

      // Documento
      if (message.type === 'document') {
        text = `📄 [Documento: ${message.document?.filename || 'archivo'}]`;
      }

      if (text) {
        await messageQueue.add({
          from: message.from,
          text,
          messageType,
          waMessageId: message.id,
          contactName: contact?.profile?.name || 'Desconocido',
          timestamp: message.timestamp,
          businessPhoneNumberId: metadata.phone_number_id,
          businessDisplayPhone: metadata.display_phone_number,
          // Datos extra de ubicación
          locationData: message.type === 'location' ? message.location : null
        });

        console.log(`📩 [${messageType}] de ${message.from}: ${text.substring(0, 50)}`);
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error en webhook:', error.message);
    res.sendStatus(500);
  }
};

module.exports = { verifyWebhook, receiveMessage };
