import { randomUUID, randomBytes } from 'node:crypto';
export function repository(pool, config) {
  return {
    async endpoints() {
      return (await pool.query(`SELECT e.*, count(r.id)::int AS request_count, max(r.received_at) AS last_received_at
        FROM endpoints e LEFT JOIN requests r ON r.endpoint_id=e.id GROUP BY e.id ORDER BY e.created_at`)).rows;
    },
    async createEndpoint(input) {
      // Serialize endpoint quota checks across concurrent requests/processes.
      const c = await pool.connect();
      try {
        await c.query('BEGIN'); await c.query('SELECT pg_advisory_xact_lock(872135)');
        const count = await c.query('SELECT count(*)::int AS n FROM endpoints');
        if (count.rows[0].n >= 25) throw Object.assign(new Error('Endpoint limit reached (25)'), {status:409});
        const result = await c.query('INSERT INTO endpoints(id,slug,name,response_status) VALUES($1,$2,$3,$4) RETURNING *',
          [randomUUID(),randomBytes(18).toString('hex'),input.name,input.responseStatus]);
        await c.query('COMMIT'); return result.rows[0];
      } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    },
    async updateEndpoint(id, input) { return (await pool.query('UPDATE endpoints SET name=$2,response_status=$3 WHERE id=$1 RETURNING *',[id,input.name,input.responseStatus])).rows[0]; },
    async deleteEndpoint(id) { return (await pool.query('DELETE FROM endpoints WHERE id=$1',[id])).rowCount; },
    async clear(id) { await pool.query('DELETE FROM requests WHERE endpoint_id=$1',[id]); },
    async capture(slug, data) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const endpoint = (await c.query('SELECT * FROM endpoints WHERE slug=$1 FOR UPDATE',[slug])).rows[0];
        if (!endpoint) { await c.query('ROLLBACK'); return null; }
        const result = await c.query(`INSERT INTO requests(id,endpoint_id,method,path,query,headers,body,body_bytes,response_status)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,endpoint_id,method,path,body_bytes,response_status,received_at`,
          [randomUUID(),endpoint.id,data.method,data.path,JSON.stringify(data.query),JSON.stringify(data.headers),data.body,data.body.length,endpoint.response_status]);
        await c.query(`DELETE FROM requests WHERE endpoint_id=$1 AND id IN
          (SELECT id FROM requests WHERE endpoint_id=$1 ORDER BY received_at DESC,id DESC OFFSET $2)`,[endpoint.id,config.maxRequests]);
        await c.query('COMMIT'); return result.rows[0];
      } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
    },
    async requests(endpointId, {limit,offset,method,q}) {
      // Parameterized ILIKE; escape wildcard characters so search is literal.
      const pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
      const params = [endpointId,method,pattern];
      const where = `endpoint_id=$1 AND ($2::text IS NULL OR method=$2) AND path ILIKE $3`;
      const count = await pool.query(`SELECT count(*)::int AS total FROM requests WHERE ${where}`, params);
      const rows = await pool.query(`SELECT id,endpoint_id,method,path,body_bytes,response_status,received_at FROM requests WHERE ${where} ORDER BY received_at DESC,id DESC LIMIT $4 OFFSET $5`,[...params,limit,offset]);
      return {items:rows.rows,total:count.rows[0].total};
    },
    async request(id) { return (await pool.query('SELECT * FROM requests WHERE id=$1',[id])).rows[0]; },
    async replays(id) { return (await pool.query('SELECT * FROM replays WHERE request_id=$1 ORDER BY created_at DESC LIMIT 20',[id])).rows; },
    async saveReplay(id, target, result) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const exists=await c.query('SELECT id FROM requests WHERE id=$1 FOR UPDATE',[id]);
        if(!exists.rowCount)throw Object.assign(new Error('Request expired during replay'),{status:404});
        const saved=await c.query(`INSERT INTO replays(id,request_id,target,status,duration_ms,response_body,error) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
          [randomUUID(),id,target,result.status,result.durationMs,result.body,result.error]);
        await c.query(`DELETE FROM replays WHERE request_id=$1 AND id IN
          (SELECT id FROM replays WHERE request_id=$1 ORDER BY created_at DESC,id DESC OFFSET 20)`,[id]);
        await c.query('COMMIT');return saved.rows[0];
      }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
    },
    async prune() { await pool.query(`DELETE FROM requests WHERE received_at < now() - ($1 * interval '1 day')`,[config.retentionDays]); }
  };
}
