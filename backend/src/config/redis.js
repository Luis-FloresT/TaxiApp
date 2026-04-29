const Redis = require('ioredis');
require('dotenv').config();

const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL)
  : new Redis({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
    });

redis.on('connect', () => console.log('✅ Redis conectado'));
redis.on('error', (err) => console.error('❌ Error Redis:', err.message));

module.exports = redis;
