const buckets = new Map();

const getClientKey = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) return String(forwardedFor).split(',')[0].trim();
  return req.ip || req.socket.remoteAddress || 'unknown';
};

const rateLimit = ({ windowMs = 60_000, max = 60, message = 'Demasiadas solicitudes' } = {}) => {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${getClientKey(req)}:${req.path}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;

    if (current.count > max) {
      res.set('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
      return res.status(429).json({ error: message });
    }

    return next();
  };
};

setInterval(() => {
  const now = Date.now();
  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= now) buckets.delete(key);
  }
}, 60_000).unref();

module.exports = rateLimit;
