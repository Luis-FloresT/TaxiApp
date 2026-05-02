const express = require('express');
const router = express.Router();
const pool = require('../config/db');

const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, phone_number, vehicle_label, availability_status, last_assigned_at
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
  const { name, phoneNumber, vehicleLabel, availabilityStatus = 'available' } = req.body;
  const normalizedPhone = normalizePhone(phoneNumber);
  const allowedStatuses = ['available', 'busy', 'offline'];
  const nextAvailability = allowedStatuses.includes(availabilityStatus) ? availabilityStatus : 'available';

  if (!normalizedPhone) {
    return res.status(400).json({ error: 'Número de WhatsApp requerido' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO driver_contacts (name, phone_number, vehicle_label, availability_status, active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (phone_number) DO UPDATE SET
         name = COALESCE(NULLIF(EXCLUDED.name, ''), driver_contacts.name),
         vehicle_label = COALESCE(NULLIF(EXCLUDED.vehicle_label, ''), driver_contacts.vehicle_label),
         availability_status = EXCLUDED.availability_status,
         active = true,
         updated_at = NOW()
       RETURNING id, name, phone_number, vehicle_label, availability_status, last_assigned_at`,
      [String(name || ''), normalizedPhone, String(vehicleLabel || ''), nextAvailability]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error guardando taxista:', error.message);
    res.status(500).json({ error: 'No se pudo guardar el taxista' });
  }
});

router.patch('/:id', async (req, res) => {
  const { name, phoneNumber, vehicleLabel, availabilityStatus } = req.body;
  const allowedStatuses = ['available', 'busy', 'offline'];
  const normalizedPhone = phoneNumber ? normalizePhone(phoneNumber) : null;

  if (availabilityStatus && !allowedStatuses.includes(availabilityStatus)) {
    return res.status(400).json({ error: 'Estado de taxista inválido' });
  }

  try {
    const result = await pool.query(
      `UPDATE driver_contacts
       SET name = COALESCE($1, name),
           phone_number = COALESCE($2, phone_number),
           vehicle_label = COALESCE($3, vehicle_label),
           availability_status = COALESCE($4, availability_status),
           updated_at = NOW()
       WHERE id = $5 AND active = true
       RETURNING id, name, phone_number, vehicle_label, availability_status, last_assigned_at`,
      [
        name === undefined ? null : String(name || ''),
        normalizedPhone,
        vehicleLabel === undefined ? null : String(vehicleLabel || ''),
        availabilityStatus || null,
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Taxista no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error actualizando taxista:', error.message);
    res.status(500).json({ error: 'No se pudo actualizar el taxista' });
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
