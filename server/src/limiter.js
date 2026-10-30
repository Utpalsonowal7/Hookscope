// Single-process limits. Use a shared limiter before horizontal scaling.
export function createLimiter({ windowMs = 60000, max = 120, maxKeys = 10000 } = {}) {
  const entries = new Map();
  return (key, now = Date.now()) => {
    for (const [k,v] of entries) if (v.reset <= now) entries.delete(k);
    let entry = entries.get(key);
    if (!entry) {
      if (entries.size >= maxKeys) return false;
      entry = { count: 0, reset: now + windowMs }; entries.set(key, entry);
    }
    return ++entry.count <= max;
  };
}
