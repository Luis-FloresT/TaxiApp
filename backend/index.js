require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const authMiddleware = require('./src/middlewares/auth');
const rateLimit = require('./src/middlewares/rateLimit');
const pool = require('./src/config/db');
const { cleanEnv, isEnabled } = require('./src/config/env');
const { ensureOperationalSchema } = require('./src/config/migrations');
const { startCustomerCleanup } = require('./src/services/customerCleanup');

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
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: isProduction ? allowedOrigins : '*'
  },
  pingInterval: 25_000,
  pingTimeout: 20_000
});

app.use(cors(corsOptions));
app.use(express.json({ limit: cleanEnv(process.env.JSON_BODY_LIMIT, '256kb') }));

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.requestTimeout = 30_000;

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    env: isProduction ? 'production' : 'development',
    whatsapp: cleanEnv(process.env.WA_ACCESS_TOKEN) === 'pending' ? 'simulated' : 'configured',
    uptime_seconds: Math.round(process.uptime()),
    memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    db_pool: {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    }
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

ensureOperationalSchema()
  .then(() => {
    console.log('✅ Esquema operativo listo');
    startCustomerCleanup();
  })
  .catch(error => console.error('❌ Error preparando esquema:', error.message));

// Rutas públicas (sin token)
app.use('/webhook', rateLimit({ windowMs: 60_000, max: 300 }), require('./src/routes/webhook'));
app.use('/auth/login', rateLimit({ windowMs: 5 * 60_000, max: 20, message: 'Demasiados intentos de inicio de sesión' }));
app.use('/auth', require('./src/routes/auth'));

// Ruta de simulación pública (solo desarrollo)
if (enableSimulator) {
  const messageQueue = require('./src/queues/messageQueue');
  app.post('/simulate', rateLimit({ windowMs: 60_000, max: 120 }), async (req, res) => {
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
app.use('/whatsapp-numbers', authMiddleware, require('./src/routes/whatsappNumbers'));
app.use('/quick-replies', authMiddleware, require('./src/routes/quickReplies'));
app.use('/reports', authMiddleware, require('./src/routes/reports'));

app.use('/bot', authMiddleware, require('./src/routes/bot'));

require('./src/sockets/chat')(io);

const PORT = process.env.PORT || 3000;
const listener = server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});

const shutdown = async (signal) => {
  console.log(`🛑 Recibido ${signal}, cerrando servidor...`);
  listener.close(async () => {
    try {
      await pool.end();
      console.log('✅ Pool PostgreSQL cerrado');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error cerrando pool:', error.message);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error('❌ Cierre forzado por timeout');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { io };
