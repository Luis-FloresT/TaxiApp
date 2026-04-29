const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, phone_number, vehicle_label
       FROM driver_contacts
       WHERE active = true
       ORDER BY name, phone_number`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error obteniendo taxistas:', error.message);
    res.status(500).json({ error: 'No se pudo cargar la lista de taxistas' });
  }
});

router.post('/', async (req, res) => {
  const { name, phoneNumber, vehicleLabel } = req.body;
  const normalizedPhone = normalizePhone(phoneNumber);

  if (!normalizedPhone) {
    return res.status(400).json({ error: 'Número de WhatsApp requerido' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO driver_contacts (name, phone_number, vehicle_label, active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (phone_number) DO UPDATE SET
         name = COALESCE(NULLIF(EXCLUDED.name, ''), driver_contacts.name),
         vehicle_label = COALESCE(NULLIF(EXCLUDED.vehicle_label, ''), driver_contacts.vehicle_label),
         active = true,
         updated_at = NOW()
       RETURNING id, name, phone_number, vehicle_label`,
      [String(name || ''), normalizedPhone, String(vehicleLabel || '')]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error guardando taxista:', error.message);
    res.status(500).json({ error: 'No se pudo guardar el taxista' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      'UPDATE driver_contacts SET active = false, updated_at = NOW() WHERE id = $1',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error desactivando taxista:', error.message);
    res.status(500).json({ error: 'No se pudo desactivar el taxista' });
  }
});

module.exports = router;
