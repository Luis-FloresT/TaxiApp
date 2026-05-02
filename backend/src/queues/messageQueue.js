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

const findActiveRideForDriver = async (pool, phoneNumber) => {
  const assignedRideResult = await pool.query(
    `SELECT id, contact_name, phone_number, assigned_driver_name, assigned_driver_phone
     FROM chats
     WHERE assigned_driver_phone = $1
       AND status <> 'closed'
       AND ride_status IN ('dispatched', 'accepted', 'en_route', 'picked_up')
     ORDER BY driver_dispatched_at DESC NULLS LAST, updated_at DESC
     LIMIT 1`,
    [phoneNumber]
  );

  return assignedRideResult.rows[0] || null;
};

const getIncomingContactRole = async (pool, phoneNumber) => {
  const result = await pool.query(
    `SELECT
       EXISTS (
         SELECT 1 FROM driver_contacts
         WHERE phone_number = $1 AND active = true
       ) AS is_registered_driver,
       EXISTS (
         SELECT 1 FROM chats
         WHERE phone_number = $1 AND contact_type = 'driver'
       ) AS has_driver_chat,
       EXISTS (
         SELECT 1 FROM chats
         WHERE assigned_driver_phone = $1
           AND status <> 'closed'
           AND ride_status IN ('dispatched', 'accepted', 'en_route', 'picked_up')
       ) AS has_active_ride`,
    [phoneNumber]
  );

  const flags = result.rows[0] || {};
  return flags.is_registered_driver || flags.has_driver_chat || flags.has_active_ride
    ? 'driver'
    : 'customer';
};

const upsertIncomingChat = async ({ pool, from, contactName, contactType }) => {
  const isDriver = contactType === 'driver';
  const result = await pool.query(
    `INSERT INTO chats (phone_number, contact_name, status, bot_active, bot_step, contact_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (phone_number) DO UPDATE SET
       contact_name = COALESCE(NULLIF(EXCLUDED.contact_name, ''), chats.contact_name),
       contact_type = CASE
         WHEN chats.contact_type = 'driver' OR EXCLUDED.contact_type = 'driver' THEN 'driver'
         ELSE chats.contact_type
       END,
       status = CASE
         WHEN chats.status = 'closed' THEN chats.status
         WHEN chats.contact_type = 'driver' OR EXCLUDED.contact_type = 'driver' THEN 'active'
         ELSE chats.status
       END,
       bot_active = CASE
         WHEN chats.contact_type = 'driver' OR EXCLUDED.contact_type = 'driver' THEN false
         ELSE chats.bot_active
       END,
       bot_step = CASE
         WHEN chats.contact_type = 'driver' OR EXCLUDED.contact_type = 'driver' THEN 'driver'
         ELSE chats.bot_step
       END,
       updated_at = NOW()
     RETURNING id, contact_type`,
    [
      from,
      contactName,
      isDriver ? 'active' : 'pending',
      !isDriver,
      isDriver ? 'driver' : 'welcome',
      contactType
    ]
  );

  return result.rows[0];
};

const processJob = async (data) => {
  const { from, text, waMessageId, contactName, locationData, messageType } = data;
  const pool = require('../config/db');
  const { processMessage } = require('../bot/chatbot');
  const { trySendWhatsAppText } = require('../services/whatsapp');

  const contactType = await getIncomingContactRole(pool, from);
  const chat = await upsertIncomingChat({ pool, from, contactName, contactType });
  const chatId = chat.id;

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

  if (contactType === 'driver') {
    const driverCommand = detectDriverCommand(text);
    const assignedRide = await findActiveRideForDriver(pool, from);

    if (driverCommand && assignedRide) {
      const timestampColumn = driverStatusColumns[driverCommand.status];
      const timestampSet = timestampColumn ? `, ${timestampColumn} = NOW()` : '';

      await pool.query(
        `UPDATE chats
         SET ride_status = $1,
             updated_at = NOW()
             ${timestampSet}
         WHERE id = $2`,
        [driverCommand.status, assignedRide.id]
      );

      await pool.query(
        `INSERT INTO messages (chat_id, content, from_agent, message_type)
         VALUES ($1, $2, true, 'dispatch')`,
        [assignedRide.id, driverCommand.label]
      );

      if (driverCommand.status === 'accepted') {
        const driverName = assignedRide.assigned_driver_name || 'El taxista';
        await trySendWhatsAppText(
          assignedRide.phone_number,
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
      io.emit('message_sent', { chatId: assignedRide.id, text: driverCommand.label, fromAgent: true });
      io.emit('chat_updated', { chatId: assignedRide.id, ride_status: driverCommand.status });
      return;
    }

    if (driverCommand && !assignedRide) {
      await pool.query(
        `INSERT INTO messages (chat_id, content, from_agent, message_type)
         VALUES ($1, $2, true, 'driver_dispatch')`,
        [chatId, 'Comando recibido, pero este taxista no tiene una carrera activa asignada.']
      );
    }

    const { io } = require('../../index');
    io.emit('new_message', {
      chatId, from, contactName, text,
      timestamp: new Date(),
      botResponse: null,
      contactType: 'driver'
    });
    return;
  }

  const driverCommand = detectDriverCommand(text);
  if (driverCommand) {
    const assignedRide = await findActiveRideForDriver(pool, from);

    if (assignedRide) {
      const ride = assignedRide;
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
