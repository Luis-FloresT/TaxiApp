const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { listWhatsAppNumbers } = require('../services/whatsappNumbers');
const { cleanEnv } = require('../config/env');

const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');
const canAdmin = (role) => ['admin', 'superadmin'].includes(role);

router.get('/', async (req, res) => {
  try {
    const numbers = await listWhatsAppNumbers(req.agent);
    res.json(numbers);
  } catch (error) {
    console.error('❌ Error cargando líneas de WhatsApp:', error.message);
    res.status(500).json({ error: 'No se pudieron cargar las líneas de WhatsApp' });
  }
});

router.post('/', async (req, res) => {
  if (!canAdmin(req.agent?.role)) {
    return res.status(403).json({ error: 'Solo un administrador puede agregar líneas' });
  }

  const label = cleanEnv(req.body?.label);
  const phoneNumberId = cleanEnv(req.body?.phoneNumberId || req.body?.phone_number_id);
  const displayPhone = normalizePhone(req.body?.displayPhone || req.body?.display_phone_number);
  const accessToken = cleanEnv(req.body?.accessToken || req.body?.access_token);
  const isDefault = Boolean(req.body?.isDefault);

  if (!label || !phoneNumberId) {
    return res.status(400).json({ error: 'Nombre de línea y Phone Number ID son requeridos' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO whatsapp_numbers (label, phone_number_id, display_phone_number, access_token, is_default, active)
       VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, true)
       ON CONFLICT (phone_number_id) DO UPDATE SET
         label = EXCLUDED.label,
         display_phone_number = COALESCE(EXCLUDED.display_phone_number, whatsapp_numbers.display_phone_number),
         access_token = COALESCE(EXCLUDED.access_token, whatsapp_numbers.access_token),
         is_default = EXCLUDED.is_default,
         active = true,
         updated_at = NOW()
       RETURNING id, label, phone_number_id, display_phone_number, is_default, active`,
      [label, phoneNumberId, displayPhone, accessToken, isDefault]
    );

    if (isDefault) {
      await pool.query('UPDATE whatsapp_numbers SET is_default = false WHERE id <> $1', [result.rows[0].id]);
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error guardando línea de WhatsApp:', error.message);
    res.status(500).json({ error: 'No se pudo guardar la línea de WhatsApp' });
  }
});

router.patch('/:id', async (req, res) => {
  if (!canAdmin(req.agent?.role)) {
    return res.status(403).json({ error: 'Solo un administrador puede editar líneas' });
  }

  const label = req.body?.label === undefined ? null : cleanEnv(req.body.label);
  const phoneNumberId = req.body?.phoneNumberId === undefined && req.body?.phone_number_id === undefined
    ? null
    : cleanEnv(req.body?.phoneNumberId || req.body?.phone_number_id);
  const displayPhone = req.body?.displayPhone === undefined && req.body?.display_phone_number === undefined
    ? null
    : normalizePhone(req.body?.displayPhone || req.body?.display_phone_number);
  const accessToken = req.body?.accessToken === undefined && req.body?.access_token === undefined
    ? null
    : cleanEnv(req.body?.accessToken || req.body?.access_token);
  const isDefault = req.body?.isDefault === undefined && req.body?.is_default === undefined
    ? null
    : Boolean(req.body?.isDefault ?? req.body?.is_default);
  const active = req.body?.active === undefined ? null : Boolean(req.body.active);

  try {
    const currentResult = await pool.query(
      'SELECT phone_number_id FROM whatsapp_numbers WHERE id = $1',
      [req.params.id]
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Línea no encontrada' });
    }

    const previousPhoneNumberId = currentResult.rows[0].phone_number_id;
    const result = await pool.query(
      `UPDATE whatsapp_numbers
       SET label = COALESCE(NULLIF($1, ''), label),
           phone_number_id = COALESCE(NULLIF($2, ''), phone_number_id),
           display_phone_number = CASE WHEN $3::text IS NULL THEN display_phone_number ELSE NULLIF($3, '') END,
           access_token = COALESCE(NULLIF($4, ''), access_token),
           is_default = COALESCE($5, is_default),
           active = COALESCE($6, active),
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, label, phone_number_id, display_phone_number, is_default, active`,
      [label, phoneNumberId, displayPhone, accessToken, isDefault, active, req.params.id]
    );

    if (isDefault === true) {
      await pool.query('UPDATE whatsapp_numbers SET is_default = false WHERE id <> $1', [req.params.id]);
    }

    if (phoneNumberId && phoneNumberId !== previousPhoneNumberId) {
      await pool.query(
        `UPDATE chats
         SET line_key = $1, updated_at = NOW()
         WHERE whatsapp_number_id = $2 AND line_key = $3`,
        [phoneNumberId, req.params.id, previousPhoneNumberId]
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    const isDuplicate = error.code === '23505';
    console.error('❌ Error actualizando línea de WhatsApp:', error.message);
    res.status(isDuplicate ? 409 : 500).json({
      error: isDuplicate ? 'Ese Phone Number ID ya está registrado' : 'No se pudo actualizar la línea'
    });
  }
});

router.delete('/:id', async (req, res) => {
  if (!canAdmin(req.agent?.role)) {
    return res.status(403).json({ error: 'Solo un administrador puede desactivar líneas' });
  }

  try {
    await pool.query(
      `UPDATE whatsapp_numbers
       SET active = false, is_default = false, updated_at = NOW()
       WHERE id = $1`,
      [req.params.id]
    );

    await pool.query(
      `UPDATE agents
       SET default_whatsapp_number_id = NULL, updated_at = NOW()
       WHERE default_whatsapp_number_id = $1`,
      [req.params.id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error desactivando línea de WhatsApp:', error.message);
    res.status(500).json({ error: 'No se pudo desactivar la línea' });
  }
});

module.exports = router;
