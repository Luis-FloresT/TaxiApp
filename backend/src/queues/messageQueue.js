const Queue = require('bull');
require('dotenv').config();
const { sendWhatsAppText } = require('../services/whatsapp');

const redisConfig = process.env.REDIS_URL || {
  redis: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  }
};

const messageQueue = new Queue('whatsapp-messages', redisConfig);

messageQueue.process(async (job) => {
  const { from, text, waMessageId, contactName } = job.data;
  const pool = require('../config/db');
  const { processMessage } = require('../bot/chatbot');

  // Buscar o crear chat
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
    console.log(`🆕 Nuevo chat: ${from}`);
  } else {
    chatId = chatResult.rows[0].id;
    await pool.query(
      `UPDATE chats
       SET contact_name = COALESCE(NULLIF($1, ''), contact_name),
           updated_at = NOW()
       WHERE id = $2`,
      [contactName, chatId]
    );
  }

  // Guardar mensaje del cliente. Si Meta reintenta el webhook, no duplicamos.
  const insertedMessage = await pool.query(
    `INSERT INTO messages (chat_id, content, from_agent, wa_message_id, message_type,
      location_lat, location_lng, location_name, location_address)
     VALUES ($1, $2, false, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (wa_message_id) DO NOTHING
     RETURNING id`,
    [
      chatId,
      text,
      waMessageId,
      job.data.messageType || 'text',
      job.data.locationData?.latitude || null,
      job.data.locationData?.longitude || null,
      job.data.locationData?.name || null,
      job.data.locationData?.address || null,
    ]
  );

  if (insertedMessage.rows.length === 0) {
    return;
  }

  await pool.query('UPDATE chats SET updated_at = NOW() WHERE id = $1', [chatId]);

  // Procesar con el bot
  const botResponse = await processMessage(chatId, text);

  if (botResponse) {
    // Guardar respuesta del bot en BD
    await pool.query(
      `INSERT INTO messages (chat_id, content, from_agent)
       VALUES ($1, $2, true)`,
      [chatId, botResponse]
    );
    await pool.query('UPDATE chats SET updated_at = NOW() WHERE id = $1', [chatId]);

    await sendWhatsAppText(from, botResponse);
  }

  // Notificar al panel en tiempo real
  const { io } = require('../../index');
  io.emit('new_message', {
    chatId, from, contactName, text,
    timestamp: new Date(),
    botResponse
  });
});

messageQueue.on('failed', (job, err) => {
  console.error('❌ Error en cola:', err.message);
});

module.exports = messageQueue;
