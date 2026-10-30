import pg from 'pg';
export function createPool(connectionString) {
  return new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000,
    statement_timeout: 10000 });
}
