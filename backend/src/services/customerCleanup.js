const pool = require('../config/db');
const { cleanEnv } = require('../config/env');

const DAY_MS = 24 * 60 * 60 * 1000;

const getRetentionDays = () => {
  const value = Number(cleanEnv(process.env.CUSTOMER_NO_RIDE_RETENTION_DAYS, '7'));
  if (!Number.isFinite(value) || value < 1) return 7;
  return Math.min(value, 365);
};

const isCleanupEnabled = () =>
  cleanEnv(process.env.CUSTOMER_AUTO_CLEANUP_ENABLED, 'true').toLowerCase() !== 'false';

const cleanupInactiveCustomerChats = async () => {
  const retentionDays = getRetentionDays();
  const result = await pool.query(
    `WITH deleted AS (
       DELETE FROM chats
       WHERE contact_type = 'customer'
         AND ride_status = 'pending'
         AND assigned_driver_phone IS NULL
         AND updated_at < NOW() - ($1::int * INTERVAL '1 day')
       RETURNING id
     )
     SELECT COUNT(*)::int AS deleted_count
     FROM deleted`,
    [retentionDays]
  );

  const deletedCount = result.rows[0]?.deleted_count || 0;
  if (deletedCount > 0) {
    console.log(`🧹 Limpieza automática: ${deletedCount} clientes sin carrera eliminados`);
  }

  return deletedCount;
};

const startCustomerCleanup = () => {
  if (!isCleanupEnabled()) {
    console.log('🧹 Limpieza automática de clientes desactivada');
    return null;
  }

  const firstRunDelay = Number(cleanEnv(process.env.CUSTOMER_CLEANUP_FIRST_RUN_MS, '300000'));
  const interval = setInterval(() => {
    cleanupInactiveCustomerChats()
      .catch(error => console.error('❌ Error en limpieza automática de clientes:', error.message));
  }, DAY_MS);

  interval.unref();

  setTimeout(() => {
    cleanupInactiveCustomerChats()
      .catch(error => console.error('❌ Error en limpieza automática de clientes:', error.message));
  }, Number.isFinite(firstRunDelay) ? firstRunDelay : 300000).unref();

  console.log(`🧹 Limpieza automática de clientes activa (${getRetentionDays()} días sin carrera)`);
  return interval;
};

module.exports = { cleanupInactiveCustomerChats, startCustomerCleanup };
