const cleanEnv = (value, fallback = '') => {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).trim().replace(/^['"]|['"]$/g, '');
};

const isEnabled = (value) => cleanEnv(value).toLowerCase() === 'true';

module.exports = { cleanEnv, isEnabled };
