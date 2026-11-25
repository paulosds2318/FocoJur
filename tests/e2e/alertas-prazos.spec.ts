import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { Pool } from 'pg';

// Alerta -> criar tarefa (prazo limite + interno), filtros de responsável e dia, fórmula do risco e tela de Auditoria.
const ADMIN = { email: 'admin@focojur.local', password: 'AdminSenha2026' };
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TS = Date.now();
const TAG = `E2E-ALR-${TS}`;
const NUM = `9988${String(TS).slice(-9)}`.padEnd(20, '0').slice(0, 20);

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name=email]', ADMIN.email);
  await page.fill('input[name=password]', ADMIN.password);
  await page.click('button[type=submit]');
  await page.waitForURL(/inicio/);
}

test.afterAll(async () => {
  const { rows } = await pool.query(`select id from task where title like $1`, [`${TAG}%`]);
  const ids = rows.map((r) => String(r.id));
  await pool.query(`delete from task where title like $1`, [`${TAG}%`]);
  await pool.query(`delete from movement where external_id like $1`, [`${TAG}%`]);
  await pool.query(`delete from "case" where number = $1`, [NUM]);
  if (ids.length) await pool.query(`delete from audit_log where entity_id = any($1::text[])`, [ids]);
  await pool.query(`delete from app_setting where key = 'risk_formula'`);
  await pool.end();
});

test('alerta vira tarefa com prazo limite e interno; o interno não passa do limite; filtros de dia e de responsável', async ({ page }) => {
  await login(page);
  const { rows: [c] } = await pool.query(`insert into "case" (number, portfolio) values ($1, 'civil') returning id`, [NUM]);
  await pool.query(
    `insert into movement (case_id, source, external_id, occurred_at, title, raw_text, triage_status) values ($1, 'djen', $2, now(), 'Intimação', $3, 'pending')`,
    [c.id, `${TAG}-1`, `${TAG} texto`],
  );

  // o aviso global aparece e o alerta oferece só "Criar tarefa" e "Ignorar"
  await page.goto('/alertas');
  await expect(page.getByRole('link', { name: 'Atualizações de processos aguardando decisão' })).toBeVisible();
  await page.locator('section[aria-label="Lista de alertas"] li', { hasText: `${TAG} texto` }).getByRole('link').click();
  const box = page.getByRole('complementary', { name: 'Detalhe do alerta' });
  await expect(box.getByRole('button', { name: /marcar como lida/i })).toHaveCount(0);
  await expect(box.getByRole('group', { name: /Responsáveis/ })).toContainText('nenhuma = sem responsável'); // vários responsáveis: nenhum marcado = sem responsável
  await box.locator('input[name=title]').fill(`${TAG} tarefa`);
  await box.locator('input[name=dueDate]').fill('2031-08-20');
  await box.locator('input[name=internalDueDate]').fill('2031-08-25');
  await box.getByRole('button', { name: 'Criar tarefa' }).click();
  await expect(page.getByText('O prazo interno não pode ser depois do prazo limite.')).toBeVisible();
  await box.locator('input[name=internalDueDate]').fill('2031-08-18');
  await box.getByRole('button', { name: 'Criar tarefa' }).click();
  await expect(page).toHaveURL(/alertas\?criada=2031-08-20/); // volta à tela de alertas, que abre o próximo
  await expect(page.getByText('O alerta ficou como lido.')).toBeVisible();

  const { rows: [m] } = await pool.query(`select triage_status from movement where external_id = $1`, [`${TAG}-1`]);
  expect(m.triage_status).toBe('task_created');
  const { rows: [t] } = await pool.query(`select due_date::text as d, internal_due_date::text as i, owner_id from task where title = $1`, [`${TAG} tarefa`]);
  expect(t).toMatchObject({ d: '2031-08-20', i: '2031-08-18', owner_id: null });

  // filtro por dia: acha pelo prazo limite e pelo interno; outro dia não acha
  await page.goto('/tarefas?layout=list&dia=2031-08-18');
  await expect(page.getByRole('cell', { name: `${TAG} tarefa` })).toBeVisible();
  await page.goto('/tarefas?layout=list&dia=2031-08-20');
  await expect(page.getByRole('cell', { name: `${TAG} tarefa` })).toBeVisible();
  await page.goto('/tarefas?layout=list&dia=2031-08-19');
  await expect(page.getByRole('cell', { name: `${TAG} tarefa` })).toHaveCount(0);

  // filtro de responsável: "Sem responsável" inclui, o admin não
  await page.goto('/tarefas?layout=list&resp=none');
  await expect(page.getByRole('cell', { name: `${TAG} tarefa` })).toBeVisible();
  const { rows: [adm] } = await pool.query(`select id from "user" where email = $1`, [ADMIN.email]);
  await page.goto(`/tarefas?layout=list&resp=${adm.id}`);
  await expect(page.getByRole('cell', { name: `${TAG} tarefa` })).toHaveCount(0);

  // a edição mostra os dois prazos
  await page.goto('/tarefas?layout=list&resp=none');
  await page.locator('tr', { hasText: `${TAG} tarefa` }).getByRole('link', { name: 'Editar' }).click();
  await expect(page.locator('input[name=dueDate]')).toHaveValue('2031-08-20');
  await expect(page.locator('input[name=internalDueDate]')).toHaveValue('2031-08-18');
});

test('fórmula do risco é configurada em Listas oficiais e a Auditoria mostra o que cada usuário fez', async ({ page }) => {
  await login(page);
  await page.goto('/admin/listas?tipo=formula-risco');
  await expect(page.getByRole('heading', { name: 'Fórmula do valor de risco' })).toBeVisible();
  await page.getByLabel(/Calcular o valor de risco automaticamente/).check();
  await page.locator('input[name=pct_juizado]').fill('20');
  await page.getByRole('button', { name: 'Salvar fórmula' }).click();
  await expect(page.getByText('Fórmula salva.')).toBeVisible();
  await page.reload();
  await expect(page.locator('input[name=pct_juizado]')).toHaveValue('20');
  // o simulador usa a fórmula salva: R$ 13.680,00 + 20% = 16.416,00; + 20% de honorários = 19.699,20
  await expect(page.getByTestId('risco-total')).toContainText('19.699,20');
  // e confere o exemplo da planilha trocando a categoria: Vara Cível R$ 5.000,00 -> R$ 7.440,00
  await page.getByLabel('Valor da causa para simular').fill('5.000,00');
  await page.getByLabel('Categoria para simular').selectOption('vara');
  await expect(page.getByTestId('risco-total')).toContainText('7.440,00');

  // a mudança está na auditoria, com o nome de quem fez
  await page.goto('/admin/auditoria?entidade=app_setting');
  await expect(page.getByRole('heading', { name: 'Auditoria' })).toBeVisible();
  await expect(page.locator('tr', { hasText: 'Configuração' }).first()).toContainText('Alterou');
  const { rows: [adm] } = await pool.query(`select id, name from "user" where email = $1`, [ADMIN.email]);
  await page.goto(`/admin/auditoria?usuario=${adm.id}`);
  await expect(page.getByRole('region', { name: /Registros de auditoria/ }).or(page.locator('section[aria-label="Registros de auditoria"]'))).toContainText(adm.name);
  await expect(page.getByRole('navigation', { name: 'Paginação' })).toContainText('registros');
});
