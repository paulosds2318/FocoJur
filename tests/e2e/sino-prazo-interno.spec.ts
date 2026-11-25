import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { Pool } from 'pg';

// Sininho de alertas (chegada e pendência) e prazo interno automático por tipo de tarefa.
const ADMIN = { email: 'admin@focojur.local', password: 'AdminSenha2026' };
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TS = Date.now();
const TAG = `E2E-HIS-${TS}`;
const N = (suffix: number) => `9984${String(TS).slice(-8)}${suffix}`.padEnd(20, '0').slice(0, 20);

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name=email]', ADMIN.email);
  await page.fill('input[name=password]', ADMIN.password);
  await page.click('button[type=submit]');
  await page.waitForURL(/inicio/);
}

test.afterAll(async () => {
    await pool.query(`delete from movement where external_id like $1`, [`${TAG}%`]);
  await pool.query(`delete from task where title like $1`, [`${TAG}%`]);
  await pool.query(`delete from "case" where number like $1`, [`9984${String(TS).slice(-8)}%`]);
  await pool.query(`delete from lookup where code = $1`, [`e2e_his_${TS}`]);
  await pool.end();
});

test('sininho mostra os alertas pendentes e leva ao alerta; a lista mostra "chegou em" e "pendente há"', async ({ page }) => {
  await login(page);
  const numero = N(2);
  const { rows: [c] } = await pool.query(`insert into "case" (number, portfolio, monitoring) values ($1, 'civil', true) returning id`, [numero]);
  const { rows: [m] } = await pool.query(
    `insert into movement (case_id, source, external_id, occurred_at, created_at, title, raw_text, triage_status) values ($1, 'djen', $2, now() - interval '3 days', now() - interval '3 days', 'Intimação', $3, 'pending') returning id`,
    [c.id, `${TAG}-sino`, `${TAG} texto do sino`],
  );

  await page.goto('/inicio');
  const sino = page.getByRole('button', { name: /Alertas: \d+ aguardando decisão/ });
  await expect(sino).toBeVisible();
  await sino.click();
  const lista = page.getByRole('region', { name: 'Alertas pendentes' });
  await expect(lista).toBeVisible();
  await expect(lista.getByRole('link', { name: 'Ver todos os alertas' })).toBeVisible();
  expect(await lista.getByRole('listitem').count()).toBeLessThanOrEqual(8); // só os mais recentes
  await lista.getByRole('listitem').first().getByRole('link').click(); // leva ao alerta
  await expect(page).toHaveURL(/\/alertas\?item=/);

  await page.goto(`/alertas?item=${m.id}`); // o nosso alerta (de 3 dias atrás) pelo endereço
  const detalhe = page.getByRole('complementary', { name: 'Detalhe do alerta' });
  await expect(detalhe).toContainText(`${TAG} texto do sino`);
  await expect(detalhe).toContainText('Aguardando decisão há 3 dias');
  await expect(page.locator('section[aria-label="Lista de alertas"] li', { hasText: `${TAG} texto do sino` })).toContainText('Pendente há 3 dias');
  await expect(page.locator('section[aria-label="Lista de alertas"] li', { hasText: `${TAG} texto do sino` })).toContainText('chegou em');
});

test('tipo de tarefa com regra de prazo interno: admin configura e a tarefa nasce com o prazo interno calculado', async ({ page }) => {
  await login(page);
  const { rows: [tipo] } = await pool.query(`insert into lookup (type, code, label, sort) values ('task_type', $1, $2, 98) returning id`, [`e2e_his_${TS}`, `${TAG} tipo`]);

  await page.goto('/admin/listas?tipo=task_type');
  const linha = page.locator('tr', { hasText: `${TAG} tipo` });
  await linha.getByLabel(`Dias úteis do prazo interno de ${TAG} tipo`).fill('3');
  await linha.getByRole('button', { name: 'Salvar' }).first().click();
  await expect(page.getByText('Regra salva.')).toBeVisible();
  const { rows: [l] } = await pool.query(`select internal_days from lookup where id = $1`, [tipo.id]);
  expect(l.internal_days).toBe(3);

  await page.goto('/tarefas');
  await page.locator('summary:has-text("Nova tarefa")').click();
  await page.fill('input[name=title]', `${TAG} com regra`);
  await page.selectOption('select[name=typeId]', { label: `${TAG} tipo` });
  await page.fill('input[name=dueDate]', '2031-06-20'); // sexta-feira
  await page.click('button:has-text("Criar tarefa")');
  await expect(page.getByText('Tarefa criada.')).toBeVisible();
  const { rows: [t] } = await pool.query(`select internal_due_date::text as i from task where title = $1`, [`${TAG} com regra`]);
  expect(t.i).toBe('2031-06-17'); // 3 dias úteis antes (terça-feira)
});
