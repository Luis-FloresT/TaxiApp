const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/', async (req, res) => {
  const result = await pool.query(
    `SELECT * FROM quick_replies 
     WHERE active = true 
     ORDER BY category, title`
  );
  res.json(result.rows);
});

router.post('/', async (req, res) => {
  const { title, message, category } = req.body;

  if (!title || !message) {
    return res.status(400).json({ error: 'Título y mensaje son requeridos' });
  }

  const result = await pool.query(
    `INSERT INTO quick_replies (title, message, category)
     VALUES ($1, $2, $3) RETURNING *`,
    [title, message, category || 'general']
  );
  res.status(201).json(result.rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query(
    'UPDATE quick_replies SET active = false WHERE id = $1',
    [req.params.id]
  );
  res.json({ success: true });
});

module.exports = router;
