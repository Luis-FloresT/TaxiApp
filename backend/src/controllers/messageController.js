const pool = require('../config/db');
const { sendWhatsAppText } = require('../services/whatsapp');

const sendMessage = async (req, res) => {
  const { to, text, chatId } = req.body;

  try {
    await sendWhatsAppText(to, text);

    await pool.query(
      'INSERT INTO messages (chat_id, content, from_agent) VALUES ($1, $2, true)',
      [chatId, text]
    );
    await pool.query(
      `UPDATE chats SET bot_active = false, bot_step = 'agent', updated_at = NOW()
       WHERE id = $1`,
      [chatId]
    );

    // Notificar en tiempo real
    const { io } = require('../../index');
    io.emit('message_sent', { chatId, text, fromAgent: true });

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: 'Error enviando mensaje' });
  }
};

const getMessages = async (req, res) => {
  const { chatId } = req.params;
  const result = await pool.query(
    'SELECT * FROM messages WHERE chat_id = $1 ORDER BY timestamp ASC',
    [chatId]
  );
  res.json(result.rows);
};

module.exports = { sendMessage, getMessages };
