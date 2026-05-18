const pool = require('../config/db');

const adminRoles = ['admin', 'superadmin'];

const canAdmin = (role) => adminRoles.includes(role);

const normalizeAgentAccess = (agent = {}) => ({
  ...agent,
  can_view_all_numbers: agent.can_view_all_numbers !== false,
  can_switch_numbers: agent.can_switch_numbers !== false,
  default_whatsapp_number_id: agent.default_whatsapp_number_id || null
});

const loadAgentAccess = async (agentId) => {
  const result = await pool.query(
    `SELECT id, name, username, email, role, active,
            can_view_all_numbers, can_switch_numbers, default_whatsapp_number_id
     FROM agents
     WHERE id = $1 AND active = true`,
    [agentId]
  );

  return result.rows[0] ? normalizeAgentAccess(result.rows[0]) : null;
};

const getAllowedLineIds = async (agent) => {
  const currentAgent = normalizeAgentAccess(agent);

  if (canAdmin(currentAgent.role) || currentAgent.can_view_all_numbers) {
    return null;
  }

  const result = await pool.query(
    `SELECT DISTINCT whatsapp_number_id
     FROM agent_whatsapp_numbers
     WHERE agent_id = $1
     UNION
     SELECT default_whatsapp_number_id
     FROM agents
     WHERE id = $1 AND default_whatsapp_number_id IS NOT NULL`,
    [currentAgent.id]
  );

  return result.rows
    .map(row => Number(row.whatsapp_number_id))
    .filter(Boolean);
};

const assertCanUseLine = async (agent, whatsappNumberId) => {
  const currentAgent = normalizeAgentAccess(agent);
  const requestedId = Number(whatsappNumberId || 0);

  if (canAdmin(currentAgent.role)) return true;

  if (!requestedId) {
    if (currentAgent.can_view_all_numbers) return true;
    const error = new Error('Este chat no tiene una línea asignada permitida para el operador');
    error.status = 403;
    throw error;
  }

  if (!currentAgent.can_switch_numbers && currentAgent.default_whatsapp_number_id) {
    if (requestedId !== Number(currentAgent.default_whatsapp_number_id)) {
      const error = new Error('Este operador tiene un número fijo asignado');
      error.status = 403;
      throw error;
    }
  }

  if (currentAgent.can_view_all_numbers) return true;

  const allowedIds = await getAllowedLineIds(currentAgent);
  if (allowedIds.includes(requestedId)) return true;

  const error = new Error('Este operador no tiene acceso a esa línea de WhatsApp');
  error.status = 403;
  throw error;
};

const resolveRequestedLineId = async (agent, whatsappNumberId) => {
  const currentAgent = normalizeAgentAccess(agent);
  const requestedId = Number(whatsappNumberId || 0);

  if (requestedId > 0) {
    await assertCanUseLine(currentAgent, requestedId);
    return requestedId;
  }

  if (canAdmin(currentAgent.role) || currentAgent.can_view_all_numbers) {
    return null;
  }

  if (currentAgent.default_whatsapp_number_id) {
    return Number(currentAgent.default_whatsapp_number_id);
  }

  const allowedIds = await getAllowedLineIds(currentAgent);
  if (allowedIds[0]) return allowedIds[0];

  const error = new Error('Este operador no tiene líneas de WhatsApp asignadas');
  error.status = 403;
  throw error;
};

module.exports = {
  assertCanUseLine,
  canAdmin,
  getAllowedLineIds,
  loadAgentAccess,
  normalizeAgentAccess,
  resolveRequestedLineId
};
