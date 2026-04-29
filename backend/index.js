require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const authMiddleware = require('./src/middlewares/auth');
const pool = require('./src/config/db');
const { cleanEnv, isEnabled } = require('./src/config/env');

const isProduction = cleanEnv(process.env.NODE_ENV) === 'production';
const allowedOrigins = (cleanEnv(process.env.CORS_ORIGIN) || cleanEnv(process.env.FRONTEND_URL))
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const enableSimulator = isEnabled(process.env.ENABLE_SIMULATOR) || !isProduction;
const corsOptions = {
  origin: (origin, callback) => {
    if (!isProduction || !origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error('Origen no permitido por CORS'));
  }
};

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: isProduction ? allowedOrigins : '*'
  }
});

app.use(cors(corsOptions));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    env: isProduction ? 'production' : 'development',
    whatsapp: cleanEnv(process.env.WA_ACCESS_TOKEN) === 'pending' ? 'simulated' : 'configured'
  });
});

app.get('/health/db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as now');
    res.json({ ok: true, now: result.rows[0].now });
  } catch (error) {
    console.error('❌ Health DB error:', error.message);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Rutas públicas (sin token)
app.use('/webhook', require('./src/routes/webhook'));
app.use('/auth', require('./src/routes/auth'));

// Ruta de simulación pública (solo desarrollo)
if (enableSimulator) {
  const messageQueue = require('./src/queues/messageQueue');
  app.post('/simulate', async (req, res) => {
    const { phone, name, text, messageType = 'text', locationData } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Teléfono requerido' });
    }

    let simulatedText = text;
    if (messageType === 'location' && locationData) {
      const { latitude, longitude, name: placeName, address } = locationData;
      simulatedText = `📍 Ubicación compartida:\nLat: ${latitude}, Lng: ${longitude}`;
      if (placeName) simulatedText += `\nLugar: ${placeName}`;
      if (address) simulatedText += `\nDirección: ${address}`;
      simulatedText += `\n🗺️ Ver en Maps: https://maps.google.com/?q=${latitude},${longitude}`;
    }

    if (!simulatedText) {
      return res.status(400).json({ error: 'Mensaje requerido' });
    }

    await messageQueue.add({
      from: phone,
      text: simulatedText,
      waMessageId: 'sim_' + Date.now(),
      contactName: name,
      timestamp: Date.now(),
      messageType,
      locationData: messageType === 'location' ? locationData : null
    });
    res.json({ success: true });
  });
}

// Rutas protegidas (requieren token)
app.use('/chats', authMiddleware, require('./src/routes/chats'));
app.use('/drivers', authMiddleware, require('./src/routes/drivers'));
app.use('/quick-replies', authMiddleware, require('./src/routes/quickReplies'));

app.use('/bot', authMiddleware, require('./src/routes/bot'));

require('./src/sockets/chat')(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});

module.exports = { io };
