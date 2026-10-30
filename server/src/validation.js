export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
export const isUUID = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
export function endpointInput(body) {
  if (!body || typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 60) throw Object.assign(new Error('Name must contain 1–60 characters'), { status: 400 });
  const status = body.responseStatus ?? 200;
  if (!Number.isInteger(status) || ![200, 201, 202, 204, 400, 401, 403, 404, 409, 422, 500, 503].includes(status)) throw Object.assign(new Error('Unsupported response status'), { status: 400 });
  return { name: body.name.trim(), responseStatus: status };
}
export function listInput(query) {
  const limit = Number(query.limit ?? 50), offset = Number(query.offset ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000) throw Object.assign(new Error('Invalid pagination'), { status: 400 });
  if (query.method && !METHODS.includes(query.method)) throw Object.assign(new Error('Invalid method'), { status: 400 });
  if (query.q && (typeof query.q !== 'string' || query.q.length > 100)) throw Object.assign(new Error('Search is limited to 100 characters'), { status: 400 });
  return { limit, offset, method: query.method || null, q: query.q || '' };
}
