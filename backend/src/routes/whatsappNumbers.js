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

module.exports = router;
