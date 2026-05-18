const pool = require('../config/db');
const { sendWhatsAppText } = require('../services/whatsapp');

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`👤 Operador conectado: ${socket.id}`);

    socket.on('send_message', async ({ to, text, chatId }) => {
      try {
        const chatResult = await pool.query(
          `SELECT phone_number, whatsapp_number_id
           FROM chats
           WHERE id = $1`,
          [chatId]
        );

        await sendWhatsAppText(to || chatResult.rows[0]?.phone_number, text, {
          whatsappNumberId: chatResult.rows[0]?.whatsapp_number_id
        });

        await pool.query(
          'INSERT INTO messages (chat_id, content, from_agent) VALUES ($1, $2, true)',
          [chatId, text]
        );
        await pool.query(
          `UPDATE chats SET bot_active = false, bot_step = 'agent', updated_at = NOW()
           WHERE id = $1`,
          [chatId]
        );

        io.emit('message_sent', { chatId, text, fromAgent: true });
      } catch (err) {
        console.error('❌ Error socket:', err.message);
      }
    });

    socket.on('disconnect', () => {
      console.log(`👤 Operador desconectado: ${socket.id}`);
    });
  });
};
