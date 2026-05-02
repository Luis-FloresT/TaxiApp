const axios = require('axios');
require('dotenv').config();

const driverCommands = [
  { pattern: /^acepto\b/i, status: 'accepted', label: 'Taxista aceptó la carrera' },
  { pattern: /^en camino\b/i, status: 'en_route', label: 'Taxista está en camino' },
  { pattern: /^recogido\b/i, status: 'picked_up', label: 'Cliente recogido por el taxista' },
  { pattern: /^(finalizada|finalizado|terminada|terminado)\b/i, status: 'completed', label: 'Carrera finalizada por el taxista' },
  { pattern: /^cancelad[ao]\b/i, status: 'cancelled', label: 'Carrera cancelada por el taxista' }
];

const driverStatusColumns = {
  accepted: 'driver_accepted_at',
  en_route: 'driver_en_route_at',
  picked_up: 'picked_up_at',
  completed: 'completed_at',
  cancelled: 'cancelled_at'
};

const detectDriverCommand = (text) =>
  driverCommands.find(command => command.pattern.test(String(text || '').trim()));

const processJob = async (data) => {
  const { from, text, waMessageId, contactName, locationData, messageType } = data;
  const pool = require('../config/db');
  const { processMessage } = require('../bot/chatbot');
  const { trySendWhatsAppText } = require('../services/whatsapp');

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

  const driverCommand = detectDriverCommand(text);
  if (driverCommand) {
    const assignedRideResult = await pool.query(
      `SELECT id, contact_name, phone_number, assigned_driver_name, assigned_driver_phone
       FROM chats
       WHERE assigned_driver_phone = $1
         AND status <> 'closed'
         AND ride_status IN ('dispatched', 'accepted', 'en_route', 'picked_up')
       ORDER BY driver_dispatched_at DESC NULLS LAST, updated_at DESC
       LIMIT 1`,
      [from]
    );

    if (assignedRideResult.rows.length > 0) {
      const ride = assignedRideResult.rows[0];
      const timestampColumn = driverStatusColumns[driverCommand.status];
      const timestampSet = timestampColumn ? `, ${timestampColumn} = NOW()` : '';

      await pool.query(
        `UPDATE chats
         SET ride_status = $1,
             updated_at = NOW()
             ${timestampSet}
         WHERE id = $2`,
        [driverCommand.status, ride.id]
      );

      await pool.query(
        `INSERT INTO messages (chat_id, content, from_agent, message_type)
         VALUES ($1, $2, true, 'dispatch')`,
        [ride.id, driverCommand.label]
      );

      if (driverCommand.status === 'accepted') {
        const driverName = ride.assigned_driver_name || 'El taxista';
        await trySendWhatsAppText(
          ride.phone_number,
          `${driverName} confirmó la carrera y estará allá en breve.`
        );
      }

      if (['completed', 'cancelled'].includes(driverCommand.status)) {
        await pool.query(
          `UPDATE driver_contacts
           SET availability_status = 'available', updated_at = NOW()
           WHERE phone_number = $1`,
          [from]
        );
      }

      const { io } = require('../../index');
      io.emit('message_sent', { chatId, text, fromAgent: false });
      io.emit('message_sent', { chatId: ride.id, text: driverCommand.label, fromAgent: true });
      io.emit('chat_updated', { chatId: ride.id, ride_status: driverCommand.status });
      return;
    }
  }

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
