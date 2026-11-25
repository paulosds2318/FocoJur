import 'dotenv/config';

// Dispara o alerta diário manualmente (teste): `pnpm digest`
async function main() {
  const { sendDailyDeadlineDigest } = await import('../src/server/digest');
  const { pool } = await import('../src/db');
  const n = await sendDailyDeadlineDigest();
  console.log(`${n} e-mail(s) enviado(s) (veja em http://localhost:8025).`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
