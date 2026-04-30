const { Pool } = require('pg');
require('dotenv').config();
const { cleanEnv, isEnabled } = require('./env');

const databaseUrl = cleanEnv(process.env.DATABASE_URL);
const dbSsl = isEnabled(process.env.DB_SSL);
const dbConnectTimeoutMs = Number(cleanEnv(process.env.DB_CONNECT_TIMEOUT_MS, '10000'));

const poolConfig = databaseUrl
  ? {
      connectionString: databaseUrl,
      ssl: dbSsl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: dbConnectTimeoutMs
    }
  : {
      host: cleanEnv(process.env.DB_HOST),
      port: cleanEnv(process.env.DB_PORT),
      database: cleanEnv(process.env.DB_NAME),
      user: cleanEnv(process.env.DB_USER),
      password: cleanEnv(process.env.DB_PASSWORD),
      ssl: dbSsl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: dbConnectTimeoutMs
    };

const pool = new Pool(poolConfig);

pool.connect()
  .then(() => console.log('✅ PostgreSQL conectado'))
  .catch(err => console.error('❌ Error PostgreSQL:', err.message));

module.exports = pool;
