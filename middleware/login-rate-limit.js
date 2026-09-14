/**
 * A limit on failed logins, counted per client address in memory.
 */

export function createLoginRateLimit({ maxAttempts, windowMinutes, now = Date.now }) {
  const windowMs = windowMinutes * 60 * 1000;

  const attempts = new Map();

  const keyOf = (req) => req.ip ?? "unknown";

  function sweep(at) {
    for (const [key, entry] of attempts) {
      if (at - entry.firstAt >= windowMs) attempts.delete(key);
    }
  }

  function middleware(req, res, next) {
    const at = now();
    sweep(at);

    const entry = attempts.get(keyOf(req));
    if (entry && entry.count >= maxAttempts) {
      const waitMs = entry.firstAt + windowMs - at;
      res.set("Retry-After", String(Math.max(1, Math.ceil(waitMs / 1000))));
      return res.status(429).type("txt").send("Too many attempts. Please wait and try again.");
    }

    return next();
  }

  function recordFailure(req) {
    const at = now();
    const key = keyOf(req);
    const entry = attempts.get(key);

    if (!entry || at - entry.firstAt >= windowMs) {
      attempts.set(key, { count: 1, firstAt: at });
      return;
    }

    entry.count += 1;
  }

  function clear(req) {
    attempts.delete(keyOf(req));
  }

  return { middleware, recordFailure, clear };
}
