import { isIP } from 'node:net';
// IPv6 replay is deliberately unsupported. Reject special-purpose IPv4 ranges.
export function isPublicIPv4(address) {
  if (isIP(address) !== 4) return false;
  const [a,b,c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 2 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}
export async function resolveTarget(target, allowedOrigins, lookup) {
  let url;
  try { url = new URL(target); } catch { throw new Error('Enter a valid HTTPS URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !allowedOrigins.includes(url.origin)) throw new Error('Target must match a configured HTTPS replay origin');
  const addresses = await lookup(url.hostname, {all:true, family:4});
  if (!addresses.length || addresses.some(x => !isPublicIPv4(x.address))) throw new Error('Replay requires a public IPv4 destination');
  return { url, address: addresses[0].address };
}
