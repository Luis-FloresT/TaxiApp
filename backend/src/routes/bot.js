const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Obtener todas las opciones del menú
router.get('/menu', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM bot_menu ORDER BY option_number'
  );
  res.json(result.rows);
});

// Actualizar una opción del menú
router.put('/menu/:id', async (req, res) => {
  const { id } = req.params;
  const { option_text, response, goes_to_agent, active } = req.body;

  await pool.query(
    `UPDATE bot_menu SET option_text = $1, response = $2,
     goes_to_agent = $3, active = $4 WHERE id = $5`,
    [option_text, response, goes_to_agent, active, id]
  );

  res.json({ success: true });
});

// Agregar nueva opción
router.post('/menu', async (req, res) => {
  const { option_text, response, goes_to_agent } = req.body;

  const maxOption = await pool.query(
    'SELECT MAX(option_number) as max FROM bot_menu'
  );
  const nextNumber = (maxOption.rows[0].max || 0) + 1;

  const result = await pool.query(
    `INSERT INTO bot_menu (option_number, option_text, response, goes_to_agent)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [nextNumber, option_text, response, goes_to_agent || false]
  );

  res.json(result.rows[0]);
});

// Eliminar opción
router.delete('/menu/:id', async (req, res) => {
  await pool.query(
    'UPDATE bot_menu SET active = false WHERE id = $1',
    [req.params.id]
  );
  res.json({ success: true });
});

// Obtener mensajes del sistema
router.get('/messages', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM bot_system_messages ORDER BY key'
  );
  res.json(result.rows);
});

// Actualizar mensaje del sistema
router.put('/messages/:key', async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  await pool.query(
    `INSERT INTO bot_system_messages (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2`,
    [key, value]
  );

  res.json({ success: true });
});

module.exports = router;