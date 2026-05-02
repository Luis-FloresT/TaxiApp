const { Pool } = require('pg');
require('dotenv').config();
const { cleanEnv, isEnabled } = require('./env');

const publicDatabaseUrl = cleanEnv(process.env.DATABASE_PUBLIC_URL);
const privateDatabaseUrl = cleanEnv(process.env.DATABASE_URL);
const databaseUrl = publicDatabaseUrl || privateDatabaseUrl;
const dbSsl = isEnabled(process.env.DB_SSL);
const dbConnectTimeoutMs = Number(cleanEnv(process.env.DB_CONNECT_TIMEOUT_MS, '10000'));
const dbPoolMax = Number(cleanEnv(process.env.DB_POOL_MAX, '5'));
const dbIdleTimeoutMs = Number(cleanEnv(process.env.DB_IDLE_TIMEOUT_MS, '30000'));
const dbQueryTimeoutMs = Number(cleanEnv(process.env.DB_QUERY_TIMEOUT_MS, '15000'));
const dbStatementTimeoutMs = Number(cleanEnv(process.env.DB_STATEMENT_TIMEOUT_MS, '15000'));
const dbIdleTransactionTimeoutMs = Number(cleanEnv(process.env.DB_IDLE_TX_TIMEOUT_MS, '15000'));

const basePoolConfig = {
  max: dbPoolMax,
  idleTimeoutMillis: dbIdleTimeoutMs,
  connectionTimeoutMillis: dbConnectTimeoutMs,
  query_timeout: dbQueryTimeoutMs,
  statement_timeout: dbStatementTimeoutMs,
  idle_in_transaction_session_timeout: dbIdleTransactionTimeoutMs,
  application_name: 'taxi-whatsapp-backend'
};

const poolConfig = databaseUrl
  ? {
      ...basePoolConfig,
      connectionString: databaseUrl,
      ssl: dbSsl ? { rejectUnauthorized: false } : false
    }
  : {
      ...basePoolConfig,
      host: cleanEnv(process.env.DB_HOST),
      port: cleanEnv(process.env.DB_PORT),
      database: cleanEnv(process.env.DB_NAME),
      user: cleanEnv(process.env.DB_USER),
      password: cleanEnv(process.env.DB_PASSWORD),
      ssl: dbSsl ? { rejectUnauthorized: false } : false
    };

const pool = new Pool(poolConfig);

pool.connect()
  .then(client => {
    client.release();
    console.log(`✅ PostgreSQL conectado (pool max ${dbPoolMax})`);
  })
  .catch(err => console.error('❌ Error PostgreSQL:', err.message));

pool.on('error', (err) => {
  console.error('❌ Error inesperado en pool PostgreSQL:', err.message);
});

module.exports = pool;
