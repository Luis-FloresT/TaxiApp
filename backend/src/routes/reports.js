const express = require('express');
const router = express.Router();
const pool = require('../config/db');

router.get('/summary', async (req, res) => {
  if (!['admin', 'superadmin'].includes(req.agent?.role)) {
    return res.status(403).json({ error: 'Solo un administrador puede ver reportes' });
  }

  try {
    const [
      todayResult,
      statusResult,
      driverResult,
      responseResult,
      lineResult,
      totalsResult,
      agentResult
    ] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE)::int as new_chats_today,
                COUNT(*) FILTER (WHERE DATE(driver_dispatched_at) = CURRENT_DATE)::int as dispatched_today,
                COUNT(*) FILTER (WHERE DATE(completed_at) = CURRENT_DATE)::int as completed_today,
                COUNT(*) FILTER (WHERE DATE(cancelled_at) = CURRENT_DATE)::int as cancelled_today
         FROM chats`
      ),
      pool.query(
        `SELECT ride_status, COUNT(*)::int as total
         FROM chats
         WHERE status <> 'closed'
         GROUP BY ride_status
         ORDER BY ride_status`
      ),
      pool.query(
        `SELECT COALESCE(assigned_driver_name, assigned_driver_phone, 'Sin taxista') as driver,
                COUNT(*)::int as total
         FROM chats
         WHERE assigned_driver_phone IS NOT NULL
           AND driver_dispatched_at >= NOW() - INTERVAL '7 days'
         GROUP BY COALESCE(assigned_driver_name, assigned_driver_phone, 'Sin taxista')
         ORDER BY total DESC
         LIMIT 10`
      ),
      pool.query(
        `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (first_agent.timestamp - first_client.timestamp)) / 60), 1) as avg_first_response_minutes
         FROM chats c
         JOIN LATERAL (
           SELECT timestamp FROM messages
           WHERE chat_id = c.id AND from_agent = false
           ORDER BY timestamp ASC LIMIT 1
         ) first_client ON true
         JOIN LATERAL (
           SELECT timestamp FROM messages
           WHERE chat_id = c.id AND from_agent = true
           ORDER BY timestamp ASC LIMIT 1
         ) first_agent ON true
         WHERE first_agent.timestamp >= first_client.timestamp`
      ),
      pool.query(
        `SELECT COALESCE(wn.label, c.line_key, 'Sin línea') AS line,
                COUNT(*) FILTER (WHERE c.status <> 'closed')::int AS open_chats,
                COUNT(*) FILTER (WHERE DATE(c.created_at) = CURRENT_DATE)::int AS new_today,
                COUNT(*) FILTER (WHERE DATE(c.driver_dispatched_at) = CURRENT_DATE)::int AS dispatched_today
         FROM chats c
         LEFT JOIN whatsapp_numbers wn ON wn.id = c.whatsapp_number_id
         GROUP BY COALESCE(wn.label, c.line_key, 'Sin línea')
         ORDER BY open_chats DESC, line ASC`
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE contact_type = 'customer')::int AS total_customers,
                COUNT(*) FILTER (WHERE contact_type = 'driver')::int AS total_driver_chats,
                COUNT(*) FILTER (WHERE status <> 'closed')::int AS open_chats,
                COUNT(*) FILTER (WHERE status = 'closed')::int AS archived_chats
         FROM chats`
      ),
      pool.query(
        `SELECT COUNT(*) FILTER (WHERE active = true)::int AS active_users,
                COUNT(*) FILTER (WHERE active = true AND role = 'admin')::int AS admins,
                COUNT(*) FILTER (WHERE active = true AND role = 'operator')::int AS operators
         FROM agents`
      )
    ]);

    res.json({
      today: todayResult.rows[0],
      totals: totalsResult.rows[0],
      agents: agentResult.rows[0],
      by_status: statusResult.rows,
      by_line: lineResult.rows,
      top_drivers_7d: driverResult.rows,
      response: responseResult.rows[0]
    });
  } catch (error) {
    console.error('❌ Error generando reportes:', error.message);
    res.status(500).json({ error: 'No se pudieron cargar los reportes' });
  }
});

module.exports = router;
