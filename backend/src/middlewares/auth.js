const jwt = require('jsonwebtoken');
const { cleanEnv } = require('../config/env');
const { loadAgentAccess } = require('../services/agentLineAccess');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    const decoded = jwt.verify(token, cleanEnv(process.env.JWT_SECRET, 'change_this_in_production'));
    const agent = await loadAgentAccess(decoded.id);
    if (!agent) {
      return res.status(403).json({ error: 'Usuario inválido o inactivo' });
    }
    req.agent = agent;
    next();
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
};

module.exports = authMiddleware;
