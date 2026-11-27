import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

const globalForDb = globalThis as unknown as { pool?: Pool };
const pool = globalForDb.pool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  // serverless: cada instância abre poucas conexões (use a connection string "pooled" do Neon)
  ...(process.env.VERCEL ? { max: 3, idleTimeoutMillis: 10_000 } : {}),
});
if (process.env.NODE_ENV !== 'production') globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { pool };
