const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { sendMessage, getMessages } = require('../controllers/messageController');
const { trySendWhatsAppText } = require('../services/whatsapp');
const { isEnabled, cleanEnv } = require('../config/env');

const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');

const upsertDriverChat = async ({ driverPhone, driverName, vehicleLabel, dispatchText, sourceChat }) => {
  const fallbackName = driverName || `Taxista +${driverPhone}`;
  const driverChatResult = await pool.query(
    `INSERT INTO chats (phone_number, contact_name, status, bot_active, bot_step)
     VALUES ($1, $2, 'active', false, 'agent')
     ON CONFLICT (phone_number) DO UPDATE SET
       contact_name = COALESCE(NULLIF(EXCLUDED.contact_name, ''), chats.contact_name),
       status = 'active',
       bot_active = false,
       bot_step = 'agent',
       updated_at = NOW()
     RETURNING id`,
    [driverPhone, fallbackName]
  );

  const label = driverName || `+${driverPhone}`;
  const vehicleText = vehicleLabel ? ` · ${vehicleLabel}` : '';
  const clientName = sourceChat.contact_name || `+${sourceChat.phone_number}`;
  const driverChatMessage = [
    `Carrera enviada a ${label}${vehicleText}`,
    `Cliente: ${clientName}`,
    `Teléfono cliente: +${sourceChat.phone_number}`,
    '',
    dispatchText
  ].join('\n');

  await pool.query(
    `INSERT INTO messages (chat_id, content, from_agent, message_type)
     VALUES ($1, $2, true, 'driver_dispatch')`,
    [driverChatResult.rows[0].id, driverChatMessage]
  );

  return driverChatResult.rows[0].id;
};

const buildDispatchMessage = ({ chat, lastClientMessage, lastLocationMessage, notes, driverName }) => {
  const lines = [
    'NUEVA CARRERA',
    `Cliente: ${chat.contact_name || 'Sin nombre'}`,
    `Telefono cliente: +${chat.phone_number}`
  ];

  if (lastLocationMessage) {
    if (lastLocationMessage.location_name) {
      lines.push(`Punto de recogida: ${lastLocationMessage.location_name}`);
    }
    if (lastLocationMessage.location_address) {
      lines.push(`Direccion: ${lastLocationMessage.location_address}`);
    }
    if (lastLocationMessage.location_lat && lastLocationMessage.location_lng) {
      lines.push(`Maps: https://maps.google.com/?q=${lastLocationMessage.location_lat},${lastLocationMessage.location_lng}`);
    }
  }

  if (lastClientMessage?.content) {
    lines.push(`Ultimo mensaje: ${lastClientMessage.content.replace(/\s+/g, ' ').trim().slice(0, 280)}`);
  }

  if (notes) {
    lines.push(`Notas operador: ${notes.replace(/\s+/g, ' ').trim().slice(0, 280)}`);
  }

  lines.push('Responder con ACEPTO para confirmar la carrera.');

  if (driverName) {
    lines.unshift(`Taxi: ${driverName}`);
  }

  return lines.join('\n');
};

const buildClientDriverConfirmation = ({ driverName, driverPhone, vehicleLabel }) => {
  const lines = [
    'Su taxi ha sido confirmado y estará allá en breve.',
    '',
    `Taxista: ${driverName || 'Taxista asignado'}`,
    `Celular: +${driverPhone}`
  ];

  if (vehicleLabel) {
    lines.push(`Móvil: ${vehicleLabel}`);
  }

  return lines.join('\n');
};

// Obtener todos los chats
router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT c.*,
            (SELECT content FROM messages WHERE chat_id = c.id
             AND message_type <> 'dispatch'
             ORDER BY timestamp DESC LIMIT 1) as last_message
     FROM chats c
     ORDER BY c.updated_at DESC`
  );
  res.json(result.rows);
});

// Obtener mensajes de un chat
router.get('/:chatId/messages', getMessages);

// Archivar chat sin borrar historial
router.patch('/:chatId/archive', async (req, res) => {
  const { chatId } = req.params;

  try {
    const result = await pool.query(
      `UPDATE chats
       SET status = 'closed', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [chatId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Chat no encontrado' });
    }

    const { io } = require('../../index');
    io.emit('chat_updated', { chatId: Number(chatId), status: 'closed' });

    res.json({ success: true, chat: result.rows[0] });
  } catch (error) {
    console.error('❌ Error archivando chat:', error.message);
    res.status(500).json({ error: 'No se pudo archivar el chat' });
  }
});

// Restaurar chat archivado
router.patch('/:chatId/restore', async (req, res) => {
  const { chatId } = req.params;

  try {
    const result = await pool.query(
      `UPDATE chats
       SET status = 'active', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [chatId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Chat no encontrado' });
    }

    const { io } = require('../../index');
    io.emit('chat_updated', { chatId: Number(chatId), status: 'active' });

    res.json({ success: true, chat: result.rows[0] });
  } catch (error) {
    console.error('❌ Error restaurando chat:', error.message);
    res.status(500).json({ error: 'No se pudo restaurar el chat' });
  }
});

// Borrar chat y sus mensajes
router.delete('/:chatId', async (req, res) => {
  const { chatId } = req.params;

  try {
    const result = await pool.query(
      `DELETE FROM chats
       WHERE id = $1
       RETURNING id`,
      [chatId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Chat no encontrado' });
    }

    const { io } = require('../../index');
    io.emit('chat_deleted', { chatId: Number(chatId) });

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error borrando chat:', error.message);
    res.status(500).json({ error: 'No se pudo borrar el chat' });
  }
});

// Enviar mensaje
router.post('/send', sendMessage);

// Despachar carrera a taxista por WhatsApp
router.post('/:chatId/dispatch-driver', async (req, res) => {
  const { chatId } = req.params;
  const { driverId, driverPhone, driverName, vehicleLabel, notes, saveDriver } = req.body;
  let normalizedDriverPhone = normalizePhone(driverPhone);
  let selectedDriverName = String(driverName || '').trim();
  let selectedVehicleLabel = String(vehicleLabel || '').trim();

  try {
    if (driverId) {
      const driverResult = await pool.query(
        `SELECT name, phone_number, vehicle_label
         FROM driver_contacts
         WHERE id = $1 AND active = true`,
        [driverId]
      );

      if (driverResult.rows.length === 0) {
        return res.status(404).json({ error: 'Taxista no encontrado' });
      }

      const driver = driverResult.rows[0];
      normalizedDriverPhone = driver.phone_number;
      selectedDriverName = driver.name;
      selectedVehicleLabel = driver.vehicle_label || '';
    }

    if (!normalizedDriverPhone) {
      return res.status(400).json({ error: 'Número de taxista inválido' });
    }

    const chatResult = await pool.query(
      `SELECT id, contact_name, phone_number
       FROM chats
       WHERE id = $1`,
      [chatId]
    );

    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Chat no encontrado' });
    }

    const chat = chatResult.rows[0];

    const [lastClientMessageResult, lastLocationMessageResult] = await Promise.all([
      pool.query(
        `SELECT content, timestamp
         FROM messages
         WHERE chat_id = $1 AND from_agent = false
         ORDER BY timestamp DESC
         LIMIT 1`,
        [chatId]
      ),
      pool.query(
        `SELECT location_lat, location_lng, location_name, location_address
         FROM messages
         WHERE chat_id = $1 AND from_agent = false
           AND (message_type = 'location' OR location_lat IS NOT NULL)
         ORDER BY timestamp DESC
         LIMIT 1`,
        [chatId]
      )
    ]);

    const dispatchText = buildDispatchMessage({
      chat,
      lastClientMessage: lastClientMessageResult.rows[0],
      lastLocationMessage: lastLocationMessageResult.rows[0],
      notes,
      driverName: selectedDriverName
    });
    const clientConfirmationText = buildClientDriverConfirmation({
      driverName: selectedDriverName,
      driverPhone: normalizedDriverPhone,
      vehicleLabel: selectedVehicleLabel
    });

    const driverSendResult = await trySendWhatsAppText(normalizedDriverPhone, dispatchText);
    const clientSendResult = await trySendWhatsAppText(chat.phone_number, clientConfirmationText);

    if (saveDriver && !driverId) {
      await pool.query(
        `INSERT INTO driver_contacts (name, phone_number, vehicle_label, active)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (phone_number) DO UPDATE SET
           name = COALESCE(NULLIF(EXCLUDED.name, ''), driver_contacts.name),
           vehicle_label = COALESCE(NULLIF(EXCLUDED.vehicle_label, ''), driver_contacts.vehicle_label),
           active = true,
           updated_at = NOW()`,
        [
          selectedDriverName || normalizedDriverPhone,
          normalizedDriverPhone,
          selectedVehicleLabel
        ]
      );
    }

    await pool.query(
      `UPDATE chats
       SET status = 'active',
           assigned_driver_phone = $1,
           assigned_driver_name = NULLIF($2, ''),
           assigned_driver_vehicle_label = NULLIF($3, ''),
           driver_dispatched_at = NOW(),
           updated_at = NOW()
       WHERE id = $4`,
      [normalizedDriverPhone, selectedDriverName, selectedVehicleLabel, chatId]
    );

    const driverLabel = selectedDriverName || `+${normalizedDriverPhone}`;
    const vehicleText = selectedVehicleLabel ? ` · ${selectedVehicleLabel}` : '';
    const dispatchLog = `Carrera enviada al taxista: ${driverLabel} (+${normalizedDriverPhone})${vehicleText}`;
    await pool.query(
      `INSERT INTO messages (chat_id, content, from_agent, message_type)
       VALUES ($1, $2, true, 'dispatch')`,
      [chatId, dispatchLog]
    );
    await pool.query(
      `INSERT INTO messages (chat_id, content, from_agent, message_type)
       VALUES ($1, $2, true, 'text')`,
      [chatId, clientConfirmationText]
    );

    const driverChatId = await upsertDriverChat({
      driverPhone: normalizedDriverPhone,
      driverName: selectedDriverName,
      vehicleLabel: selectedVehicleLabel,
      dispatchText,
      sourceChat: chat
    });

    const { io } = require('../../index');
    io.emit('message_sent', { chatId, text: clientConfirmationText, fromAgent: true });
    io.emit('message_sent', { chatId: driverChatId, text: dispatchText, fromAgent: true });

    res.status(201).json({
      success: true,
      driver_phone: normalizedDriverPhone,
      driver_name: selectedDriverName || null,
      driver_vehicle_label: selectedVehicleLabel || null,
      driver_dispatched_at: new Date().toISOString(),
      driver_chat_id: driverChatId,
      whatsapp_delivery: {
        driver: driverSendResult,
        client: clientSendResult
      }
    });
  } catch (error) {
    console.error('❌ Error despachando taxista:', error.message);
    res.status(500).json({ error: 'No se pudo despachar la carrera al taxista' });
  }
});

if (isEnabled(process.env.ENABLE_SIMULATOR) || cleanEnv(process.env.NODE_ENV) !== 'production') {
  // SOLO PARA PRUEBAS — desactivado por defecto en producción.
  router.post('/simulate', async (req, res) => {
    const { phone, name, text } = req.body;
    const messageQueue = require('../queues/messageQueue');

    await messageQueue.add({
      from: phone,
      text: text,
      waMessageId: 'sim_' + Date.now(),
      contactName: name,
      timestamp: Date.now()
    });

    res.json({ success: true, message: 'Mensaje simulado enviado' });
  });
}

// Activar/desactivar bot manualmente
router.post('/:chatId/bot', async (req, res) => {
  const { chatId } = req.params;
  const { active } = req.body;
  const { reactivateBot, deactivateBot } = require('../bot/chatbot');

  if (active) {
    await reactivateBot(chatId);
  } else {
    await deactivateBot(chatId);
  }

  res.json({ success: true, bot_active: active });
});

module.exports = router;
