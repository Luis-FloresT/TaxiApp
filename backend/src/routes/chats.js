const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { sendMessage, getMessages } = require('../controllers/messageController');
const { trySendWhatsAppText } = require('../services/whatsapp');
const { getWhatsAppNumberById } = require('../services/whatsappNumbers');
const { assertCanUseLine, canAdmin, resolveRequestedLineId } = require('../services/agentLineAccess');
const { isEnabled, cleanEnv } = require('../config/env');
const { getPagination } = require('../utils/pagination');

const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');
const MAX_CONTACT_IMPORT = 100;
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
const terminalRideStatuses = ['completed', 'cancelled'];

const assertCanAccessChat = async (agent, chatId) => {
  if (canAdmin(agent?.role)) return true;

  const result = await pool.query(
    'SELECT whatsapp_number_id FROM chats WHERE id = $1',
    [chatId]
  );

  if (result.rows.length === 0) {
    const error = new Error('Chat no encontrado');
    error.status = 404;
    throw error;
  }

  await assertCanUseLine(agent, result.rows[0].whatsapp_number_id);
  return true;
};

const upsertDriverChat = async ({ driverPhone, driverName, vehicleLabel, dispatchText, sourceChat }) => {
  const fallbackName = driverName || `Taxista +${driverPhone}`;
  const lineKey = sourceChat.line_key || 'default';
  const driverChatResult = await pool.query(
    `INSERT INTO chats (
       phone_number, contact_name, status, bot_active, bot_step, contact_type,
       related_client_chat_id, ride_status, whatsapp_number_id, line_key
     )
     VALUES ($1, $2, 'active', false, 'driver', 'driver', $3, 'dispatched', $4, $5)
     ON CONFLICT (phone_number, line_key) DO UPDATE SET
       contact_name = COALESCE(NULLIF(EXCLUDED.contact_name, ''), chats.contact_name),
       status = 'active',
       bot_active = false,
       bot_step = 'driver',
       contact_type = 'driver',
       related_client_chat_id = EXCLUDED.related_client_chat_id,
       ride_status = 'dispatched',
       whatsapp_number_id = COALESCE(EXCLUDED.whatsapp_number_id, chats.whatsapp_number_id),
       updated_at = NOW()
     RETURNING id`,
    [driverPhone, fallbackName, sourceChat.id, sourceChat.whatsapp_number_id || null, lineKey]
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
     SET ride_status = $1::text,
         status = CASE WHEN $1::text IN ('completed', 'cancelled') THEN status ELSE 'active' END,
         bot_active = CASE WHEN $1::text IN ('completed', 'cancelled') AND contact_type = 'customer' THEN true ELSE bot_active END,
         bot_step = CASE WHEN $1::text IN ('completed', 'cancelled') AND contact_type = 'customer' THEN 'welcome' ELSE bot_step END,
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

const upsertCustomerContact = async ({ name, phoneNumber, note, whatsappNumberId }) => {
  const normalizedPhone = normalizePhone(phoneNumber);
  const cleanName = String(name || '').trim();
  const cleanNote = String(note || '').trim();
  const whatsappNumber = await getWhatsAppNumberById(whatsappNumberId);
  const lineKey = whatsappNumber?.phone_number_id || 'default';

  if (!normalizedPhone || normalizedPhone.length < 8) {
    return { ok: false, error: 'Número inválido', phoneNumber };
  }

  const existingResult = await pool.query(
    `SELECT id, contact_type
     FROM chats
     WHERE phone_number = $1 AND line_key = $2`,
    [normalizedPhone, lineKey]
  );

  if (existingResult.rows[0]?.contact_type === 'driver') {
    return {
      ok: false,
      error: 'Este número ya está registrado como taxista',
      phoneNumber: normalizedPhone
    };
  }

  const result = await pool.query(
    `INSERT INTO chats (
       phone_number, contact_name, status, bot_active, bot_step,
       contact_type, ride_status, manual_contact, whatsapp_number_id, line_key
     )
     VALUES ($1, $2, 'active', true, 'welcome', 'customer', 'pending', true, $3, $4)
     ON CONFLICT (phone_number, line_key) DO UPDATE SET
       contact_name = COALESCE(NULLIF(EXCLUDED.contact_name, ''), chats.contact_name),
       status = CASE WHEN chats.status = 'closed' THEN 'active' ELSE chats.status END,
       contact_type = 'customer',
       manual_contact = true,
       whatsapp_number_id = COALESCE(EXCLUDED.whatsapp_number_id, chats.whatsapp_number_id),
       bot_active = CASE WHEN chats.contact_type = 'driver' THEN chats.bot_active ELSE chats.bot_active END,
       updated_at = NOW()
     RETURNING *`,
    [normalizedPhone, cleanName || `Cliente +${normalizedPhone}`, whatsappNumber?.id || null, lineKey]
  );

  const chat = result.rows[0];
  const message = cleanNote || 'Cliente agregado manualmente';
  await pool.query(
    `INSERT INTO messages (chat_id, content, from_agent, message_type)
     VALUES ($1, $2, true, 'system')`,
    [chat.id, message]
  );

  return { ok: true, chat };
};

// Obtener todos los chats
router.get('/', async (req, res) => {
  const { limit, offset } = getPagination(req.query, { defaultLimit: 80, maxLimit: 150 });
  const requestedLineId = req.query.whatsappNumberId === 'all' ? null : Number(req.query.whatsappNumberId || 0);

  try {
    const whatsappNumberId = await resolveRequestedLineId(req.agent, requestedLineId);
    const filterByLine = Number.isInteger(whatsappNumberId) && whatsappNumberId > 0;
    const result = await pool.query(
      `SELECT c.*,
              wn.label AS whatsapp_label,
              wn.display_phone_number AS whatsapp_display_phone,
              wn.phone_number_id AS whatsapp_phone_number_id,
              EXTRACT(EPOCH FROM (NOW() - c.updated_at)) / 60 as idle_minutes,
              (SELECT content FROM messages WHERE chat_id = c.id
               AND message_type <> 'dispatch'
               ORDER BY timestamp DESC LIMIT 1) as last_message
       FROM chats c
       LEFT JOIN whatsapp_numbers wn ON wn.id = c.whatsapp_number_id
       WHERE ($3::boolean = false OR c.whatsapp_number_id = $4)
       ORDER BY c.updated_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset, filterByLine, filterByLine ? whatsappNumberId : null]
    );
    res.set('X-Result-Limit', String(limit));
    res.set('X-Result-Offset', String(offset));
    res.set('X-Has-More', result.rows.length === limit ? 'true' : 'false');
    res.json(result.rows);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'No se pudieron cargar los chats' });
  }
});

router.post('/customers', async (req, res) => {
  const contacts = Array.isArray(req.body?.contacts)
    ? req.body.contacts
    : [{
        name: req.body?.name,
        phoneNumber: req.body?.phoneNumber,
        note: req.body?.note,
        whatsappNumberId: req.body?.whatsappNumberId
      }];

  if (contacts.length === 0) {
    return res.status(400).json({ error: 'Debes enviar al menos un cliente' });
  }

  if (contacts.length > MAX_CONTACT_IMPORT) {
    return res.status(400).json({ error: `Puedes importar máximo ${MAX_CONTACT_IMPORT} clientes por vez` });
  }

  try {
    const results = [];
    for (const contact of contacts) {
      const whatsappNumberId = await resolveRequestedLineId(
        req.agent,
        contact.whatsappNumberId || req.body?.whatsappNumberId
      );
      results.push(await upsertCustomerContact({
        ...contact,
        whatsappNumberId
      }));
    }

    const created = results.filter(result => result.ok).map(result => result.chat);
    const errors = results.filter(result => !result.ok);

    const { io } = require('../../index');
    created.forEach(chat => io.emit('chat_updated', { chatId: chat.id, ...chat }));

    res.status(created.length ? 201 : 400).json({
      success: created.length > 0,
      count: created.length,
      chats: created,
      errors
    });
  } catch (error) {
    console.error('❌ Error guardando clientes:', error.message);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudieron guardar los clientes' });
  }
});

// Obtener mensajes de un chat
router.get('/:chatId/messages', getMessages);

router.get('/:chatId/history', async (req, res) => {
  const { chatId } = req.params;

  try {
    await assertCanAccessChat(req.agent, chatId);
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
    res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudo cargar el historial' });
  }
});

router.patch('/:chatId/ride-status', async (req, res) => {
  const { chatId } = req.params;
  const { status: nextStatus } = req.body;

  try {
    await assertCanAccessChat(req.agent, chatId);
    const chat = await updateRideStatus(chatId, nextStatus);
    const statusLabel = rideStatusConfig[nextStatus].label;
    await addRideNote(chatId, `Estado de carrera actualizado: ${statusLabel}`);

    if (terminalRideStatuses.includes(nextStatus) && chat.assigned_driver_phone) {
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
    const code = error.status || (error.message.includes('inválido') ? 400 : 500);
    res.status(code).json({ error: error.message || 'No se pudo actualizar el estado' });
  }
});

// Archivar chat sin borrar historial
router.patch('/:chatId/archive', async (req, res) => {
  const { chatId } = req.params;

  try {
    await assertCanAccessChat(req.agent, chatId);
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
    res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudo archivar el chat' });
  }
});

// Restaurar chat archivado
router.patch('/:chatId/restore', async (req, res) => {
  const { chatId } = req.params;

  try {
    await assertCanAccessChat(req.agent, chatId);
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
    res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudo restaurar el chat' });
  }
});

// Borrar chat y sus mensajes
router.delete('/bulk/customers', async (req, res) => {
  const { period = 'today', includeOpenRides = false } = req.body || {};
  const periods = {
    today: "date_trunc('day', NOW())",
    week: "NOW() - INTERVAL '7 days'",
    all: null
  };

  if (!canAdmin(req.agent?.role)) {
    return res.status(403).json({ error: 'Solo un administrador puede borrar chats en lote' });
  }

  if (!Object.prototype.hasOwnProperty.call(periods, period)) {
    return res.status(400).json({ error: 'Periodo inválido' });
  }

  try {
    const dateCondition = periods[period]
      ? `AND updated_at >= ${periods[period]}`
      : '';
    const result = await pool.query(
      `WITH deleted AS (
         DELETE FROM chats
         WHERE contact_type = 'customer'
           ${dateCondition}
           AND (
             $1::boolean = true
             OR ride_status IN ('completed', 'cancelled')
           )
         RETURNING id
       )
       SELECT COALESCE(json_agg(id), '[]'::json) AS ids,
              COUNT(*)::int AS deleted_count
       FROM deleted`,
      [Boolean(includeOpenRides)]
    );

    const payload = result.rows[0] || { ids: [], deleted_count: 0 };
    const { io } = require('../../index');
    io.emit('chat_deleted', { bulk: true, chatIds: payload.ids });

    res.json({
      success: true,
      deleted_count: payload.deleted_count,
      ids: payload.ids,
      period,
      include_open_rides: Boolean(includeOpenRides)
    });
  } catch (error) {
    console.error('❌ Error borrando chats en lote:', error.message);
    res.status(500).json({ error: 'No se pudieron borrar los chats en lote' });
  }
});

router.delete('/:chatId', async (req, res) => {
  const { chatId } = req.params;

  if (!canAdmin(req.agent?.role)) {
    return res.status(403).json({ error: 'Solo un administrador puede borrar chats' });
  }

  try {
    await assertCanAccessChat(req.agent, chatId);
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
    res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudo borrar el chat' });
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
    await assertCanAccessChat(req.agent, chatId);
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
      `SELECT id, contact_name, phone_number, contact_type, whatsapp_number_id, line_key
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

    const lineOptions = { whatsappNumberId: chat.whatsapp_number_id };
    const driverSendResult = await trySendWhatsAppText(normalizedDriverPhone, dispatchText, lineOptions);
    const clientSendResult = await trySendWhatsAppText(chat.phone_number, clientConfirmationText, lineOptions);

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
    res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudo despachar la carrera al taxista' });
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

  try {
    await assertCanAccessChat(req.agent, chatId);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'No se pudo validar el chat' });
  }

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
