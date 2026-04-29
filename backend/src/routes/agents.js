const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM agents WHERE active = true'
  );
  res.json(result.rows);
});

module.exports = router;