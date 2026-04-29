const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM agents WHERE username = $1 AND active = true',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    const agent = result.rows[0];
    const validPassword = await bcrypt.compare(password, agent.password);

    if (!validPassword) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    const token = jwt.sign(
      { id: agent.id, name: agent.name, username: agent.username },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES }
    );

    res.json({
      token,
      agent: {
        id: agent.id,
        name: agent.name,
        username: agent.username,
        email: agent.email
      }
    });
  } catch (err) {
    console.error('❌ Error login:', err.message);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Verificar token
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'No autorizado' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ agent: decoded });
  } catch {
    res.status(403).json({ error: 'Token inválido' });
  }
});

// Cambiar contraseña
router.put('/change-password', async (req, res) => {
  const { username, currentPassword, newPassword } = req.body;

  try {
    const result = await pool.query(
      'SELECT * FROM agents WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const agent = result.rows[0];
    const valid = await bcrypt.compare(currentPassword, agent.password);

    if (!valid) {
      return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE agents SET password = $1 WHERE id = $2',
      [hashed, agent.id]
    );

    res.json({ success: true, message: 'Contraseña actualizada' });
  } catch (err) {
    res.status(500).json({ error: 'Error del servidor' });
  }
});

module.exports = router;