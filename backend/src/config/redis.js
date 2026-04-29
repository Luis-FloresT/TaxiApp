const Redis = require('ioredis');
require('dotenv').config();
const { cleanEnv } = require('./env');

const redisUrl = cleanEnv(process.env.REDIS_URL);

const redis = redisUrl
  ? new Redis(redisUrl)
  : new Redis({
      host: cleanEnv(process.env.REDIS_HOST),
      port: cleanEnv(process.env.REDIS_PORT),
    });

redis.on('connect', () => console.log('✅ Redis conectado'));
redis.on('error', (err) => console.error('❌ Error Redis:', err.message));

module.exports = redis;
