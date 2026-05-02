const pool = require('../config/db');
const { sendWhatsAppText } = require('../services/whatsapp');
const { getPagination } = require('../utils/pagination');

const sendMessage = async (req, res) => {
  const { to, text, chatId } = req.body;

  try {
    await sendWhatsAppText(to, text);

    await pool.query(
      'INSERT INTO messages (chat_id, content, from_agent) VALUES ($1, $2, true)',
      [chatId, text]
    );
    await pool.query(
      `UPDATE chats
       SET bot_active = false,
           bot_step = CASE WHEN contact_type = 'driver' THEN 'driver' ELSE 'agent' END,
           updated_at = NOW()
       WHERE id = $1`,
      [chatId]
    );

    // Notificar en tiempo real
    const { io } = require('../../index');
    io.emit('message_sent', { chatId, text, fromAgent: true });

    res.json({ success: true });
  } catch (error) {
    const metaError = error.response?.data?.error;
    const detail = metaError?.message || error.message;
    console.error('❌ Error enviando mensaje:', detail);
    res.status(502).json({
      error: 'Meta no aceptó el envío de WhatsApp',
      detail,
      code: metaError?.code || null,
      subcode: metaError?.error_subcode || null
    });
  }
};

const getMessages = async (req, res) => {
  const { chatId } = req.params;
  const { limit, offset } = getPagination(req.query, { defaultLimit: 80, maxLimit: 200 });
  const result = await pool.query(
    `SELECT *
     FROM (
       SELECT * FROM messages
       WHERE chat_id = $1
       ORDER BY timestamp DESC
       LIMIT $2 OFFSET $3
     ) recent
     ORDER BY timestamp ASC`,
    [chatId, limit, offset]
  );
  res.set('X-Result-Limit', String(limit));
  res.set('X-Result-Offset', String(offset));
  res.set('X-Has-More', result.rows.length === limit ? 'true' : 'false');
  res.json(result.rows);
};

module.exports = { sendMessage, getMessages };
