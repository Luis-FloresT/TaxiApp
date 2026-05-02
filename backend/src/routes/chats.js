const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { sendMessage, getMessages } = require('../controllers/messageController');
const { trySendWhatsAppText } = require('../services/whatsapp');
const { isEnabled, cleanEnv } = require('../config/env');
const { getPagination } = require('../utils/pagination');

const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');
const rideStatusConfig = {
  pending: { label: 'Pendiente', timestampColumn: null },
  dispatched: { label: 'Taxista asignado', timestampColumn: 'driver_dispatched_at' },
  accepted: { label: 'Aceptada por taxista', timestampColumn: 'driver_accepted_at' },
  en_route: { label: 'En camino', timestampColumn: 'driver_en_route_at' },
  picked_up: { label: 'Cliente recogido', timestampColumn: 'picked_up_at' },
  completed: { label: 'Finalizada', timestampColumn: 'completed_at' },
  cancelled: { label: 'Cancelada', timestampColumn: 'cancelled_at' }
};

const allowedRideStatuses = Object.keys(rideStatusConfig);

const upsertDriverChat = async ({ driverPhone, driverName, vehicleLabel, dispatchText, sourceChat }) => {
  const fallbackName = driverName || `Taxista +${driverPhone}`;
  const driverChatResult = await pool.query(
    `INSERT INTO chats (phone_number, contact_name, status, bot_active, bot_step, contact_type, related_client_chat_id, ride_status)
     VALUES ($1, $2, 'active', false, 'driver', 'driver', $3, 'dispatched')
     ON CONFLICT (phone_number) DO UPDATE SET
       contact_name = COALESCE(NULLIF(EXCLUDED.contact_name, ''), chats.contact_name),
       status = 'active',
       bot_active = false,
       bot_step = 'driver',
       contact_type = 'driver',
       related_client_chat_id = EXCLUDED.related_client_chat_id,
       ride_status = 'dispatched',
       updated_at = NOW()
     RETURNING id`,
    [driverPhone, fallbackName, sourceChat.id]
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

const addRideNote = async (chatId, content) => {
  await pool.query(
    `INSERT INTO messages (chat_id, content, from_agent, message_type)
     VALUES ($1, $2, true, 'dispatch')`,
    [chatId, content]
  );
};

const updateRideStatus = async (chatId, nextStatus) => {
  if (!allowedRideStatuses.includes(nextStatus)) {
    throw new Error('Estado de carrera inválido');
  }

  const config = rideStatusConfig[nextStatus];
  const timestampSet = config.timestampColumn ? `, ${config.timestampColumn} = NOW()` : '';
  const result = await pool.query(
    `UPDATE chats
     SET ride_status = $1,
         status = CASE WHEN $1 IN ('completed', 'cancelled') THEN status ELSE 'active' END,
         updated_at = NOW()
         ${timestampSet}
     WHERE id = $2
     RETURNING *`,
    [nextStatus, chatId]
  );

  if (result.rows.length === 0) {
    throw new Error('Chat no encontrado');
  }

  return result.rows[0];
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
  const { limit, offset } = getPagination(req.query, { defaultLimit: 80, maxLimit: 150 });
  const result = await pool.query(
    `SELECT c.*,
            EXTRACT(EPOCH FROM (NOW() - c.updated_at)) / 60 as idle_minutes,
            (SELECT content FROM messages WHERE chat_id = c.id
             AND message_type <> 'dispatch'
             ORDER BY timestamp DESC LIMIT 1) as last_message
     FROM chats c
     ORDER BY c.updated_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  res.set('X-Result-Limit', String(limit));
  res.set('X-Result-Offset', String(offset));
  res.set('X-Has-More', result.rows.length === limit ? 'true' : 'false');
  res.json(result.rows);
});

// Obtener mensajes de un chat
router.get('/:chatId/messages', getMessages);

router.get('/:chatId/history', async (req, res) => {
  const { chatId } = req.params;

  try {
    const chatResult = await pool.query(
      `SELECT id, phone_number, contact_name, assigned_driver_name, assigned_driver_phone,
              assigned_driver_vehicle_label, ride_status, driver_dispatched_at,
              driver_accepted_at, completed_at, cancelled_at
       FROM chats
       WHERE id = $1`,
      [chatId]
    );

    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Chat no encontrado' });
    }

    const chat = chatResult.rows[0];
    const [statsResult, locationsResult, dispatchesResult] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int as total_messages,
                COUNT(*) FILTER (WHERE message_type = 'dispatch')::int as total_dispatches,
                MIN(timestamp) as first_message_at,
                MAX(timestamp) as last_message_at
         FROM messages
         WHERE chat_id = $1`,
        [chatId]
      ),
      pool.query(
        `SELECT content, location_lat, location_lng, location_name, location_address, timestamp
         FROM messages
         WHERE chat_id = $1 AND (message_type = 'location' OR location_lat IS NOT NULL)
         ORDER BY timestamp DESC
         LIMIT 3`,
        [chatId]
      ),
      pool.query(
        `SELECT content, timestamp
         FROM messages
         WHERE chat_id = $1 AND message_type IN ('dispatch', 'driver_dispatch')
         ORDER BY timestamp DESC
         LIMIT 5`,
        [chatId]
      )
    ]);

    res.json({
      chat,
      stats: statsResult.rows[0],
      recent_locations: locationsResult.rows,
      dispatches: dispatchesResult.rows
    });
  } catch (error) {
    console.error('❌ Error obteniendo historial:', error.message);
    res.status(500).json({ error: 'No se pudo cargar el historial' });
  }
});

router.patch('/:chatId/ride-status', async (req, res) => {
  const { chatId } = req.params;
  const { status: nextStatus } = req.body;

  try {
    const chat = await updateRideStatus(chatId, nextStatus);
    const statusLabel = rideStatusConfig[nextStatus].label;
    await addRideNote(chatId, `Estado de carrera actualizado: ${statusLabel}`);

    if (nextStatus === 'completed' && chat.assigned_driver_phone) {
      await pool.query(
        `UPDATE driver_contacts
         SET availability_status = 'available', updated_at = NOW()
         WHERE phone_number = $1`,
        [chat.assigned_driver_phone]
      );
    }

    const { io } = require('../../index');
    io.emit('chat_updated', { chatId: Number(chatId), ride_status: nextStatus, status: chat.status });
    io.emit('message_sent', { chatId: Number(chatId), text: statusLabel, fromAgent: true });

    res.json({ success: true, chat });
  } catch (error) {
    console.error('❌ Error actualizando estado:', error.message);
    const code = error.message.includes('inválido') ? 400 : 500;
    res.status(code).json({ error: error.message || 'No se pudo actualizar el estado' });
  }
});

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

  if (req.agent?.role !== 'admin') {
    return res.status(403).json({ error: 'Solo un administrador puede borrar chats' });
  }

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
      `SELECT id, contact_name, phone_number, contact_type
       FROM chats
       WHERE id = $1`,
      [chatId]
    );

    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Chat no encontrado' });
    }

    const chat = chatResult.rows[0];

    if (chat.contact_type === 'driver') {
      return res.status(400).json({ error: 'Este chat pertenece a un taxista. Selecciona un chat de cliente para despachar.' });
    }

    if (normalizedDriverPhone === chat.phone_number) {
      return res.status(400).json({ error: 'El número del taxista no puede ser el mismo número del cliente' });
    }

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
           ride_status = 'dispatched',
           assigned_driver_phone = $1,
           assigned_driver_name = NULLIF($2, ''),
           assigned_driver_vehicle_label = NULLIF($3, ''),
           driver_dispatched_at = NOW(),
           updated_at = NOW()
       WHERE id = $4`,
      [normalizedDriverPhone, selectedDriverName, selectedVehicleLabel, chatId]
    );

    await pool.query(
      `UPDATE driver_contacts
       SET availability_status = 'busy',
           last_assigned_at = NOW(),
           updated_at = NOW()
       WHERE phone_number = $1`,
      [normalizedDriverPhone]
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

  const chatResult = await pool.query(
    'SELECT contact_type FROM chats WHERE id = $1',
    [chatId]
  );

  if (chatResult.rows.length === 0) {
    return res.status(404).json({ error: 'Chat no encontrado' });
  }

  if (chatResult.rows[0].contact_type === 'driver' && active) {
    return res.status(400).json({ error: 'El bot de clientes no se puede activar en chats de taxistas' });
  }

  if (active) {
    await reactivateBot(chatId);
  } else {
    await deactivateBot(chatId);
  }

  res.json({ success: true, bot_active: active });
});

module.exports = router;
