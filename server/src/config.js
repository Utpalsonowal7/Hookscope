function integer(value, fallback, min, max) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error('Invalid numeric configuration');
  return number;
}
export function loadConfig(env = process.env) {
  for (const key of ['DATABASE_URL', 'ADMIN_TOKEN', 'SESSION_SECRET', 'APP_ORIGIN', 'PUBLIC_BASE_URL']) {
    if (!env[key]) throw new Error(`Missing ${key}`);
  }
  for (const key of ['ADMIN_TOKEN', 'SESSION_SECRET']) {
    if (env[key].length < 32 || env[key].startsWith('replace-')) throw new Error(`${key} must be a random secret of at least 32 characters`);
  }
  if (env.ADMIN_TOKEN === env.SESSION_SECRET) throw new Error('Use distinct secrets');
  const production = env.NODE_ENV === 'production';
  const appUrl = new URL(env.APP_ORIGIN);
  if (!['http:', 'https:'].includes(appUrl.protocol) || appUrl.origin !== env.APP_ORIGIN) throw new Error('APP_ORIGIN must be an exact HTTP(S) origin');
  const origin = appUrl.origin;
  const publicUrl = new URL(env.PUBLIC_BASE_URL);
  if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash || publicUrl.pathname !== '/') throw new Error('PUBLIC_BASE_URL must be an origin');
  if (production && (!origin.startsWith('https://') || publicUrl.protocol !== 'https:')) throw new Error('Production requires HTTPS origins');
  const replayOrigins = (env.REPLAY_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const origin of replayOrigins) {
    const u = new URL(origin);
    if (u.origin !== origin || u.protocol !== 'https:' || u.username || u.password) throw new Error('Replay allowlist must contain exact HTTPS origins');
  }
  return { production, origin, publicBase: publicUrl.origin, databaseUrl: env.DATABASE_URL,
    adminToken: env.ADMIN_TOKEN, sessionSecret: env.SESSION_SECRET, replayOrigins,
    port: integer(env.PORT, 8080, 1, 65535), retentionDays: integer(env.RETENTION_DAYS, 7, 1, 30),
    maxRequests: integer(env.MAX_REQUESTS_PER_ENDPOINT, 1000, 1, 10000), maxBody: 262144 };
}
