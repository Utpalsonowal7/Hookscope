import { createHash, createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
export const SESSION_SECONDS = 8 * 60 * 60;
export function safeEqual(a, b) {
  return timingSafeEqual(createHash('sha256').update(String(a)).digest(), createHash('sha256').update(String(b)).digest());
}
export function createSession(secret, now = Date.now()) {
  const payload = `${Math.floor(now / 1000) + SESSION_SECONDS}.${randomBytes(24).toString('hex')}`;
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('hex')}`;
}
export function sessionExpiry(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !/^\d{10}\.[a-f0-9]{48}\.[a-f0-9]{64}$/.test(token)) return 0;
  const [exp, nonce, sig] = token.split('.');
  if (!safeEqual(sig, createHmac('sha256', secret).update(`${exp}.${nonce}`).digest('hex'))) return 0;
  const expires = Number(exp) * 1000;
  return expires > now && expires <= now + SESSION_SECONDS * 1000 ? expires : 0;
}
export function readCookie(header = '') {
  const cookie = header.split(';').map(x => x.trim()).find(x => x.startsWith('hookscope_session='));
  return cookie ? cookie.slice('hookscope_session='.length) : '';
}
export function sessionCookie(value, production, clear = false) {
  return `hookscope_session=${value}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${clear ? 0 : SESSION_SECONDS}${production ? '; Secure' : ''}`;
}
export function redactHeaders(headers) {
  const secret = /authorization|cookie|token|secret|api[-_]?key/i;
  return Object.fromEntries(Object.entries(headers).map(([k,v]) => [k, secret.test(k) ? '[REDACTED]' : v]));
}
export function redactQuery(query) {
  return Object.fromEntries(Object.entries(query).map(([k,v]) => [k, /password|token|secret|key|signature/i.test(k) ? '[REDACTED]' : v]));
}
