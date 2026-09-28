import pg from 'pg';
import { env } from '../config';

let pool: pg.Pool | undefined;
export function getPool(): pg.Pool {
  return (pool ??= new pg.Pool({ connectionString: env().DATABASE_URL, max: 10 }));
}
export async function closePool() {
  await pool?.end();
  pool = undefined;
}
export const q = <T extends pg.QueryResultRow = any>(text: string, params: unknown[] = []) => getPool().query<T>(text, params);
