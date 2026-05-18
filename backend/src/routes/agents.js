const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { canAdmin } = require('../services/agentLineAccess');

const adminRoles = ['admin', 'superadmin'];
const allowedRoles = ['operator', 'admin', 'superadmin'];

const requireAdmin = (req, res, next) => {
  if (!adminRoles.includes(req.agent?.role)) {
    return res.status(403).json({ error: 'Solo un administrador puede gestionar usuarios' });
  }

  next();
};

const publicAgentColumns = `
  id, name, username, email, role, active,
  can_view_all_numbers, can_switch_numbers, default_whatsapp_number_id,
  created_at, updated_at
`;

const normalizeLineIds = (lineIds) => (
  Array.isArray(lineIds) ? lineIds.map(id => Number(id)).filter(Boolean) : []
);

const syncAllowedLines = async (client, agentId, lineIds) => {
  await client.query('DELETE FROM agent_whatsapp_numbers WHERE agent_id = $1', [agentId]);

  for (const lineId of [...new Set(normalizeLineIds(lineIds))]) {
    await client.query(
      `INSERT INTO agent_whatsapp_numbers (agent_id, whatsapp_number_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [agentId, lineId]
    );
  }
};

const selectAgentsSql = `
  SELECT a.id, a.name, a.username, a.email, a.role, a.active,
         a.can_view_all_numbers, a.can_switch_numbers, a.default_whatsapp_number_id,
         a.created_at, a.updated_at,
         COALESCE(
           array_remove(array_agg(awn.whatsapp_number_id ORDER BY awn.whatsapp_number_id), NULL),
           ARRAY[]::integer[]
         ) AS allowed_whatsapp_number_ids
  FROM agents a
  LEFT JOIN agent_whatsapp_numbers awn ON awn.agent_id = a.id
`;

router.use(requireAdmin);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `${selectAgentsSql}
       GROUP BY a.id
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
  const canViewAllNumbers = req.body?.can_view_all_numbers ?? req.body?.canViewAllNumbers ?? true;
  const canSwitchNumbers = req.body?.can_switch_numbers ?? req.body?.canSwitchNumbers ?? true;
  const defaultWhatsappNumberId = Number(req.body?.default_whatsapp_number_id || req.body?.defaultWhatsappNumberId || 0) || null;
  const allowedLineIds = normalizeLineIds(req.body?.allowed_whatsapp_number_ids || req.body?.allowedWhatsappNumberIds);

  if (!name || !username || password.length < 6) {
    return res.status(400).json({ error: 'Nombre, usuario y contraseña de al menos 6 caracteres son requeridos' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await client.query(
      `INSERT INTO agents (
         name, username, email, password, role, active,
         can_view_all_numbers, can_switch_numbers, default_whatsapp_number_id
       )
       VALUES ($1, $2, NULLIF($3, ''), $4, $5, true, $6, $7, $8)
       RETURNING ${publicAgentColumns}`,
      [name, username, email, hashedPassword, role, Boolean(canViewAllNumbers), Boolean(canSwitchNumbers), defaultWhatsappNumberId]
    );

    await syncAllowedLines(client, result.rows[0].id, allowedLineIds);
    await client.query('COMMIT');

    const fullResult = await pool.query(`${selectAgentsSql} WHERE a.id = $1 GROUP BY a.id`, [result.rows[0].id]);
    res.status(201).json(fullResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    const isDuplicate = error.code === '23505';
    console.error('❌ Error creando usuario:', error.message);
    res.status(isDuplicate ? 409 : 500).json({
      error: isDuplicate ? 'Ese usuario ya existe' : 'No se pudo crear el usuario'
    });
  } finally {
    client.release();
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
  const canViewAllNumbers = req.body?.can_view_all_numbers ?? req.body?.canViewAllNumbers;
  const canSwitchNumbers = req.body?.can_switch_numbers ?? req.body?.canSwitchNumbers;
  const defaultWhatsappNumberId = req.body?.default_whatsapp_number_id === undefined && req.body?.defaultWhatsappNumberId === undefined
    ? undefined
    : (Number(req.body?.default_whatsapp_number_id || req.body?.defaultWhatsappNumberId || 0) || null);
  const shouldSyncAllowedLines = req.body?.allowed_whatsapp_number_ids !== undefined || req.body?.allowedWhatsappNumberIds !== undefined;
  const allowedLineIds = normalizeLineIds(req.body?.allowed_whatsapp_number_ids || req.body?.allowedWhatsappNumberIds);

  if (targetId === req.agent?.id && active === false) {
    return res.status(400).json({ error: 'No puedes desactivar tu propio usuario' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const targetResult = await client.query(
      'SELECT role FROM agents WHERE id = $1',
      [targetId]
    );

    if (targetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    if (targetResult.rows[0].role === 'superadmin' && req.agent?.role !== 'superadmin') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Solo un superadmin puede modificar otro superadmin' });
    }

    await client.query(
      `UPDATE agents
       SET name = COALESCE(NULLIF($1, ''), name),
           email = CASE WHEN $2::text IS NULL THEN email ELSE NULLIF($2, '') END,
           role = COALESCE($3, role),
           active = COALESCE($4, active),
           can_view_all_numbers = COALESCE($5, can_view_all_numbers),
           can_switch_numbers = COALESCE($6, can_switch_numbers),
           default_whatsapp_number_id = CASE WHEN $7::boolean THEN $8 ELSE default_whatsapp_number_id END,
           updated_at = NOW()
       WHERE id = $9`,
      [
        name,
        email,
        role,
        active,
        canViewAllNumbers === undefined ? null : Boolean(canViewAllNumbers),
        canSwitchNumbers === undefined ? null : Boolean(canSwitchNumbers),
        defaultWhatsappNumberId !== undefined,
        defaultWhatsappNumberId ?? null,
        targetId
      ]
    );

    if (shouldSyncAllowedLines) {
      await syncAllowedLines(client, targetId, allowedLineIds);
    }

    await client.query('COMMIT');

    const result = await pool.query(`${selectAgentsSql} WHERE a.id = $1 GROUP BY a.id`, [targetId]);
    res.json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error actualizando usuario:', error.message);
    res.status(500).json({ error: 'No se pudo actualizar el usuario' });
  } finally {
    client.release();
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

router.delete('/:id', async (req, res) => {
  const targetId = Number(req.params.id);

  if (!canAdmin(req.agent?.role)) {
    return res.status(403).json({ error: 'Solo un administrador puede eliminar usuarios' });
  }

  if (targetId === req.agent?.id) {
    return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
  }

  try {
    const targetResult = await pool.query(
      'SELECT role FROM agents WHERE id = $1',
      [targetId]
    );

    if (targetResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const targetRole = targetResult.rows[0].role;
    if (targetRole === 'superadmin' && req.agent?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Solo un superadmin puede eliminar otro superadmin' });
    }

    if (targetRole === 'superadmin') {
      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM agents
         WHERE role = 'superadmin' AND active = true AND id <> $1`,
        [targetId]
      );

      if (countResult.rows[0].total === 0) {
        return res.status(400).json({ error: 'Debe quedar al menos un superadmin activo' });
      }
    }

    await pool.query('DELETE FROM agents WHERE id = $1', [targetId]);
    res.json({ success: true, id: targetId });
  } catch (error) {
    console.error('❌ Error eliminando usuario:', error.message);
    res.status(500).json({ error: 'No se pudo eliminar el usuario' });
  }
});

module.exports = router;
