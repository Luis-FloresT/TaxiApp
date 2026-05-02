const pool = require('../config/db');

const getSystemMessage = async (key) => {
  try {
    const result = await pool.query(
      'SELECT value FROM bot_system_messages WHERE key = $1',
      [key]
    );
    return result.rows[0]?.value || null;
  } catch {
    return null;
  }
};

const AGENT_KEYWORDS = [
  'agente', 'operador', 'humano', 'persona',
  'asesor', 'ayuda', 'help', 'soporte'
];

const processMessage = async (chatId, messageText) => {
  try {
    const chatResult = await pool.query(
      'SELECT * FROM chats WHERE id = $1', [chatId]
    );
    const chat = chatResult.rows[0];

    if (chat?.contact_type === 'driver') return null;
    if (!chat.bot_active) return null;

    const text = messageText.trim().toLowerCase();
    const isLocation = messageText.startsWith('📍 Ubicación compartida:');

    if (isLocation) {
      await deactivateBot(chatId);
      return await getSystemMessage('location_received') ||
        'Ubicación recibida. Un operador confirmará su taxi en breve.';
    }

    // Verificar palabras clave de agente
    const wantsAgent = AGENT_KEYWORDS.some(k => text.includes(k));
    if (wantsAgent) {
      await deactivateBot(chatId);
      return await getSystemMessage('agent_transfer') ||
        'En un momento un operador estará con usted.';
    }

    // Primer mensaje - mostrar bienvenida
    if (chat.bot_step === 'welcome') {
      await pool.query(
        'UPDATE chats SET bot_step = $1 WHERE id = $2',
        ['menu', chatId]
      );
      return await getSystemMessage('welcome');
    }

    // Procesar opción del menú
    if (chat.bot_step === 'menu') {
      const option = parseInt(text);

      if (isNaN(option)) {
        return await getSystemMessage('invalid_option') ||
          'Por favor responda con un número válido.';
      }

      const menuResult = await pool.query(
        'SELECT * FROM bot_menu WHERE option_number = $1 AND active = true',
        [option]
      );

      if (menuResult.rows.length === 0) {
        return await getSystemMessage('invalid_option') ||
          'Por favor responda con un número válido.';
      }

      const menuItem = menuResult.rows[0];

      if (menuItem.goes_to_agent) {
        await deactivateBot(chatId);
        return menuItem.response;
      }

      await pool.query(
        'UPDATE chats SET bot_step = $1 WHERE id = $2',
        ['option_' + option, chatId]
      );

      return menuItem.response + '\n\n_Escriba *menu* para volver al menú o *operador* para hablar con un agente._';
    }

    // Volver al menú
    if (text === 'menu' || text === 'menú') {
      await pool.query(
        'UPDATE chats SET bot_step = $1 WHERE id = $2',
        ['menu', chatId]
      );
      return await getSystemMessage('welcome');
    }

    // Respuesta según el paso actual
    if (chat.bot_step === 'option_1') {
      await deactivateBot(chatId);
      return await getSystemMessage('address_received') ||
        '✅ Dirección recibida. Un operador confirmará su taxi en breve.';
    }

    if (chat.bot_step === 'option_2') {
      await deactivateBot(chatId);
      return '💰 Destino recibido. Un operador le indicará el precio en breve.';
    }

    if (chat.bot_step === 'option_3') {
      await deactivateBot(chatId);
      return '🔍 Verificando su reserva. Un operador le atenderá en breve.';
    }

    if (chat.bot_step === 'option_4') {
      await pool.query(
        'UPDATE chats SET bot_step = $1 WHERE id = $2',
        ['menu', chatId]
      );
      const welcome = await getSystemMessage('welcome');
      return '⏰ Estamos disponibles 24/7. ¿Necesita algo más?\n\n' + welcome;
    }

    return await getSystemMessage('welcome');

  } catch (err) {
    console.error('❌ Error en chatbot:', err.message);
    return null;
  }
};

const deactivateBot = async (chatId) => {
  await pool.query(
    `UPDATE chats SET bot_active = false, bot_step = 'agent', status = 'pending'
     WHERE id = $1`,
    [chatId]
  );
  console.log('🤖 Bot desactivado para chat ' + chatId);
};

const reactivateBot = async (chatId) => {
  await pool.query(
    `UPDATE chats SET bot_active = true, bot_step = 'welcome'
     WHERE id = $1`,
    [chatId]
  );
};

module.exports = { processMessage, deactivateBot, reactivateBot };
