import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

async function main() {
  const { db, pool } = await import('./index');
  await migrate(db, { migrationsFolder: './src/db/migrations' });
  await pool.end();
  console.log('Migrations aplicadas.');
}
main().catch((e) => { console.error(e); process.exit(1); });
