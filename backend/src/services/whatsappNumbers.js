const pool = require('../config/db');
const { cleanEnv } = require('../config/env');
const { canAdmin, getAllowedLineIds, normalizeAgentAccess } = require('./agentLineAccess');

const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');

const getLegacyNumberConfig = () => {
  const phoneNumberId = cleanEnv(process.env.WA_PHONE_ID);
  if (!phoneNumberId || phoneNumberId === 'pending') return null;

  return {
    label: cleanEnv(process.env.WA_LINE_LABEL, 'Linea principal'),
    phone_number_id: phoneNumberId,
    display_phone_number: normalizePhone(process.env.WA_DISPLAY_PHONE || ''),
    access_token: cleanEnv(process.env.WA_ACCESS_TOKEN)
  };
};

const getConfiguredNumbers = () => {
  const legacy = getLegacyNumberConfig();
  const raw = cleanEnv(process.env.WA_NUMBERS_JSON);
  if (!raw) return legacy ? [legacy] : [];

  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : [];
    const normalized = items
      .map((item, index) => ({
        label: cleanEnv(item.label, `Linea ${index + 1}`),
        phone_number_id: cleanEnv(item.phoneNumberId || item.phone_number_id || item.id),
        display_phone_number: normalizePhone(item.displayPhone || item.display_phone_number || item.phone || ''),
        access_token: cleanEnv(item.accessToken || item.access_token || process.env.WA_ACCESS_TOKEN)
      }))
      .filter(item => item.phone_number_id);

    return normalized.length ? normalized : (legacy ? [legacy] : []);
  } catch (error) {
    console.error('⚠️ WA_NUMBERS_JSON inválido:', error.message);
    return legacy ? [legacy] : [];
  }
};

const syncConfiguredWhatsAppNumbers = async () => {
  const numbers = getConfiguredNumbers();
  if (numbers.length === 0) return;

  for (const [index, number] of numbers.entries()) {
    const result = await pool.query(
      `INSERT INTO whatsapp_numbers (
         label, phone_number_id, display_phone_number, access_token, is_default, active
       )
       VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, true)
       ON CONFLICT (phone_number_id) DO UPDATE SET
         label = EXCLUDED.label,
         display_phone_number = COALESCE(EXCLUDED.display_phone_number, whatsapp_numbers.display_phone_number),
         access_token = COALESCE(EXCLUDED.access_token, whatsapp_numbers.access_token),
         is_default = CASE WHEN EXCLUDED.is_default THEN true ELSE whatsapp_numbers.is_default END,
         active = true,
         updated_at = NOW()
       RETURNING id`,
      [
        number.label,
        number.phone_number_id,
        number.display_phone_number,
        number.access_token,
        index === 0
      ]
    );

    if (index === 0) {
      await pool.query(
        `UPDATE chats
         SET whatsapp_number_id = COALESCE(whatsapp_number_id, $1),
             line_key = CASE
               WHEN line_key IS NULL OR line_key = '' OR line_key = 'default' THEN $2
               ELSE line_key
             END
         WHERE whatsapp_number_id IS NULL
            OR line_key = 'default'`,
        [result.rows[0].id, number.phone_number_id]
      );
    }
  }

  await pool.query(
    `UPDATE whatsapp_numbers
     SET is_default = false
     WHERE id NOT IN (
       SELECT id
       FROM whatsapp_numbers
       WHERE active = true
       ORDER BY is_default DESC, id ASC
       LIMIT 1
     )
     AND is_default = true`
  );
};

const getDefaultWhatsAppNumber = async () => {
  const result = await pool.query(
    `SELECT *
     FROM whatsapp_numbers
     WHERE active = true
     ORDER BY is_default DESC, id ASC
     LIMIT 1`
  );

  return result.rows[0] || null;
};

const getWhatsAppNumberById = async (id) => {
  if (!id) return getDefaultWhatsAppNumber();

  const result = await pool.query(
    `SELECT *
     FROM whatsapp_numbers
     WHERE id = $1 AND active = true`,
    [id]
  );

  return result.rows[0] || getDefaultWhatsAppNumber();
};

const getWhatsAppNumberByPhoneNumberId = async (phoneNumberId, displayPhoneNumber = '') => {
  const cleanPhoneNumberId = cleanEnv(phoneNumberId);
  if (!cleanPhoneNumberId) return getDefaultWhatsAppNumber();

  const result = await pool.query(
    `INSERT INTO whatsapp_numbers (label, phone_number_id, display_phone_number, access_token, active)
     VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), true)
     ON CONFLICT (phone_number_id) DO UPDATE SET
       display_phone_number = COALESCE(EXCLUDED.display_phone_number, whatsapp_numbers.display_phone_number),
       access_token = COALESCE(EXCLUDED.access_token, whatsapp_numbers.access_token),
       active = true,
       updated_at = NOW()
     RETURNING *`,
    [
      `Linea ${normalizePhone(displayPhoneNumber) || cleanPhoneNumberId.slice(-4)}`,
      cleanPhoneNumberId,
      normalizePhone(displayPhoneNumber),
      cleanEnv(process.env.WA_ACCESS_TOKEN)
    ]
  );

  return result.rows[0];
};

const listWhatsAppNumbers = async (agent = null) => {
  const currentAgent = agent ? normalizeAgentAccess(agent) : null;

  if (currentAgent && !canAdmin(currentAgent.role) && !currentAgent.can_view_all_numbers) {
    const allowedIds = await getAllowedLineIds(currentAgent);

    if (allowedIds.length === 0) return [];

    const result = await pool.query(
      `SELECT id, label, phone_number_id, display_phone_number, is_default, active
       FROM whatsapp_numbers
       WHERE active = true AND id = ANY($1::int[])
       ORDER BY
         CASE WHEN id = $2 THEN 0 ELSE 1 END,
         is_default DESC,
         label ASC,
         id ASC`,
      [allowedIds, currentAgent.default_whatsapp_number_id]
    );

    return result.rows;
  }

  const result = await pool.query(
    `SELECT id, label, phone_number_id, display_phone_number, is_default, active
     FROM whatsapp_numbers
     WHERE active = true
     ORDER BY is_default DESC, label ASC, id ASC`
  );

  return result.rows;
};

module.exports = {
  getDefaultWhatsAppNumber,
  getWhatsAppNumberById,
  getWhatsAppNumberByPhoneNumberId,
  listWhatsAppNumbers,
  syncConfiguredWhatsAppNumbers
};
