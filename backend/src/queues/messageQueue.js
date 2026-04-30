const axios = require('axios');
require('dotenv').config();

const processJob = async (data) => {
  const { from, text, waMessageId, contactName, locationData, messageType } = data;
  const pool = require('../config/db');
  const { processMessage } = require('../bot/chatbot');

  let chatResult = await pool.query(
    'SELECT id FROM chats WHERE phone_number = $1', [from]
  );

  let chatId;

  if (chatResult.rows.length === 0) {
    const newChat = await pool.query(
      `INSERT INTO chats (phone_number, contact_name, status, bot_active, bot_step)
       VALUES ($1, $2, 'pending', true, 'welcome') RETURNING id`,
      [from, contactName]
    );
    chatId = newChat.rows[0].id;
  } else {
    chatId = chatResult.rows[0].id;
  }

  await pool.query(
    `INSERT INTO messages (chat_id, content, from_agent, wa_message_id, message_type,
      location_lat, location_lng, location_name, location_address)
     VALUES ($1, $2, false, $3, $4, $5, $6, $7, $8)`,
    [
      chatId, text, waMessageId,
      messageType || 'text',
      locationData?.latitude || null,
      locationData?.longitude || null,
      locationData?.name || null,
      locationData?.address || null,
    ]
  );

  const botResponse = await processMessage(chatId, text);

  if (botResponse) {
    await pool.query(
      'INSERT INTO messages (chat_id, content, from_agent) VALUES ($1, $2, true)',
      [chatId, botResponse]
    );

    if (process.env.WA_ACCESS_TOKEN !== 'pending') {
      try {
        await axios.post(
          `https://graph.facebook.com/v18.0/${process.env.WA_PHONE_ID}/messages`,
          {
            messaging_product: 'whatsapp',
            to: from,
            type: 'text',
            text: { body: botResponse }
          },
          {
            headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` }
          }
        );
      } catch (err) {
        console.log('📤 [SIMULADO] Bot responde:', botResponse);
      }
    } else {
      console.log('📤 [SIMULADO] Bot responde:', botResponse);
    }
  }

  const { io } = require('../../index');
  io.emit('new_message', {
    chatId, from, contactName, text,
    timestamp: new Date(),
    botResponse
  });
};

// API compatible con Bull para no cambiar nada más
const messageQueue = {
  add: async (data) => {
    try {
      await processJob(data);
    } catch (err) {
      console.error('❌ Error procesando mensaje:', err.message);
    }
  }
};

module.exports = messageQueue;
