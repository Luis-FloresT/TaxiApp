const toPositiveInt = (value, fallback, max) => {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.min(number, max);
};

const getPagination = (query, { defaultLimit = 80, maxLimit = 150 } = {}) => {
  const limit = toPositiveInt(query.limit, defaultLimit, maxLimit);
  const offset = Math.max(Number.parseInt(query.offset, 10) || 0, 0);
  return { limit, offset };
};

module.exports = { getPagination };
