const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');

const adminRoles = ['admin', 'superadmin'];
const allowedRoles = ['operator', 'admin', 'superadmin'];

const requireAdmin = (req, res, next) => {
  if (!adminRoles.includes(req.agent?.role)) {
    return res.status(403).json({ error: 'Solo un administrador puede gestionar usuarios' });
  }

  next();
};

const publicAgentColumns = `
  id, name, username, email, role, active, created_at, updated_at
`;

router.use(requireAdmin);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ${publicAgentColumns}
       FROM agents
       ORDER BY active DESC, role ASC, name ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error cargando usuarios:', error.message);
    res.status(500).json({ error: 'No se pudieron cargar los usuarios' });
  }
});

router.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const username = String(req.body?.username || '').trim().toLowerCase();
  const email = String(req.body?.email || '').trim();
  const requestedRole = allowedRoles.includes(req.body?.role) ? req.body.role : 'operator';
  const role = requestedRole === 'superadmin' && req.agent?.role !== 'superadmin'
    ? 'admin'
    : requestedRole;
  const password = String(req.body?.password || '');

  if (!name || !username || password.length < 6) {
    return res.status(400).json({ error: 'Nombre, usuario y contraseña de al menos 6 caracteres son requeridos' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO agents (name, username, email, password, role, active)
       VALUES ($1, $2, NULLIF($3, ''), $4, $5, true)
       RETURNING ${publicAgentColumns}`,
      [name, username, email, hashedPassword, role]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    const isDuplicate = error.code === '23505';
    console.error('❌ Error creando usuario:', error.message);
    res.status(isDuplicate ? 409 : 500).json({
      error: isDuplicate ? 'Ese usuario ya existe' : 'No se pudo crear el usuario'
    });
  }
});

router.patch('/:id', async (req, res) => {
  const targetId = Number(req.params.id);
  const name = req.body?.name === undefined ? null : String(req.body.name || '').trim();
  const email = req.body?.email === undefined ? null : String(req.body.email || '').trim();
  const requestedRole = req.body?.role === undefined
    ? null
    : (allowedRoles.includes(req.body.role) ? req.body.role : 'operator');
  const role = requestedRole === 'superadmin' && req.agent?.role !== 'superadmin'
    ? 'admin'
    : requestedRole;
  const active = req.body?.active === undefined ? null : Boolean(req.body.active);

  if (targetId === req.agent?.id && active === false) {
    return res.status(400).json({ error: 'No puedes desactivar tu propio usuario' });
  }

  try {
    const targetResult = await pool.query(
      'SELECT role FROM agents WHERE id = $1',
      [targetId]
    );

    if (targetResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (targetResult.rows[0].role === 'superadmin' && req.agent?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Solo un superadmin puede modificar otro superadmin' });
    }

    const result = await pool.query(
      `UPDATE agents
       SET name = COALESCE(NULLIF($1, ''), name),
           email = CASE WHEN $2::text IS NULL THEN email ELSE NULLIF($2, '') END,
           role = COALESCE($3, role),
           active = COALESCE($4, active),
           updated_at = NOW()
       WHERE id = $5
       RETURNING ${publicAgentColumns}`,
      [name, email, role, active, targetId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('❌ Error actualizando usuario:', error.message);
    res.status(500).json({ error: 'No se pudo actualizar el usuario' });
  }
});

router.put('/:id/password', async (req, res) => {
  const password = String(req.body?.password || '');

  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `UPDATE agents
       SET password = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING ${publicAgentColumns}`,
      [hashedPassword, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json({ success: true, agent: result.rows[0] });
  } catch (error) {
    console.error('❌ Error cambiando contraseña:', error.message);
    res.status(500).json({ error: 'No se pudo cambiar la contraseña' });
  }
});

module.exports = router;
