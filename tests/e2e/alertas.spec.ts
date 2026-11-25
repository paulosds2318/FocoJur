import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { Pool } from 'pg';

// Alertas (tela /alertas): seleção (checkbox) + ações em lote. Cria andamentos de teste direto no banco e remove no fim.
const ADMIN = { email: 'admin@focojur.local', password: 'AdminSenha2026' };
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TAG = `E2E-LOTE-${Date.now()}`;

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name=email]', ADMIN.email);
  await page.fill('input[name=password]', ADMIN.password);
  await page.click('button[type=submit]');
  await page.waitForURL(/inicio/);
}
const novo = (n: number) => pool.query(
  `insert into movement (source, external_id, occurred_at, title, raw_text, triage_status) values ('djen', $1, now(), 'Intimação', $2, 'pending')`,
  [`${TAG}-${n}`, `${TAG} texto do andamento ${n}`],
);
const estado = async () => (await pool.query(`select raw_text, triage_status, discard_reason from movement where external_id like $1 order by external_id`, [`${TAG}%`])).rows;

test.afterAll(async () => {
  await pool.query(`delete from movement where external_id like $1`, [`${TAG}%`]);
  await pool.end();
});

test('checkbox seleciona o alerta e a barra age só nos selecionados (ignorar com motivo)', async ({ page }) => {
  await login(page);
  for (const n of [1, 2, 3]) await novo(n);
  await page.goto('/alertas');
  const card = (n: number) => page.locator('section[aria-label="Lista de alertas"] li', { hasText: `${TAG} texto do andamento ${n}` });
  await expect(card(1)).toBeVisible();

  // a barra de lote só aparece com itens marcados, e conta quantos
  const barra = page.getByRole('region', { name: 'Ações em lote' });
  await expect(barra).toHaveCount(0);
  await card(1).getByLabel('Selecionar item').check();
  await expect(barra).toContainText('1 selecionado');
  await card(2).getByLabel('Selecionar item').check();
  await expect(barra).toContainText('2 selecionados');
  await card(2).getByLabel('Selecionar item').uncheck();
  await card(2).getByLabel('Selecionar item').check();
  // o alerta só sai da fila ao ser ignorado (com motivo) ou virar tarefa: não há "marcar como lido"
  await expect(page.getByRole('button', { name: 'Marcar como lidos' })).toHaveCount(0);
  await expect(card(1).getByRole('button', { name: 'Só marcar como lida' })).toHaveCount(0);

  // ignorar em lote exige motivo
  await page.getByRole('button', { name: 'Ignorar selecionados' }).click();
  await expect(card(1)).toBeVisible(); // sem motivo nada acontece
  await page.locator('select[name=reason][form=batch]').selectOption('Sem providência');
  await card(1).getByLabel('Selecionar item').check();
  await card(2).getByLabel('Selecionar item').check();
  await page.getByRole('button', { name: 'Ignorar selecionados' }).click();
  await expect(card(1)).toHaveCount(0);
  await expect(card(2)).toHaveCount(0);
  await expect(card(3)).toBeVisible();

  // ignorar um só, pelo botão do próprio alerta
  await card(3).getByRole('link').click(); // abre o painel de detalhe do alerta
  const painel = page.getByRole('complementary', { name: 'Detalhe do alerta' });
  await expect(painel).toContainText(`${TAG} texto do andamento 3`);
  await painel.locator('select[name=reason]').selectOption('Duplicado');
  await painel.getByRole('button', { name: 'Ignorar', exact: true }).click();
  await expect(card(3)).toHaveCount(0);

  const rows = await estado();
  expect(rows.map((r) => r.triage_status)).toEqual(['discarded', 'discarded', 'discarded']);
  expect(rows.map((r) => r.discard_reason)).toEqual(['Sem providência', 'Sem providência', 'Duplicado']);
});

test('andamentos paginam de 20 em 20 e a página além do fim cai na última', async ({ page }) => {
  await login(page);
  const T = `${TAG}-PAG`;
  const [{ n: antes }] = (await pool.query(`select count(*)::int as n from movement where triage_status = 'pending'`)).rows;
  await pool.query(
    `insert into movement (source, external_id, occurred_at, title, raw_text, triage_status)
     select 'djen', $1 || '-' || g, now() - (g || ' minutes')::interval, 'Intimação', $1 || ' texto ' || g, 'pending' from generate_series(1, 45) g`,
    [T],
  );
  const total = antes + 45;
  const ultima = Math.ceil(total / 20);
  const resto = total - (ultima - 1) * 20;

  await page.goto('/alertas');
  const pager = page.getByRole('navigation', { name: 'Paginação' });
  await expect(pager).toContainText(new RegExp(`Mostrando 1 a 20 de ${total}`));
  await expect(page.locator('section[aria-label="Lista de alertas"] li')).toHaveCount(20);
  const primeiro = await page.locator('section[aria-label="Lista de alertas"] li').first().innerText();

  await pager.getByRole('link', { name: 'Próxima' }).click();
  await expect(page).toHaveURL(/p=2/);
  await expect(page.getByRole('navigation', { name: 'Paginação' })).toContainText(new RegExp(`Mostrando 21 a ${Math.min(40, total)} de ${total}`));
  expect(await page.locator('section[aria-label="Lista de alertas"] li').first().innerText()).not.toBe(primeiro);

  // página inexistente cai na última, com o resto dos itens
  await page.goto('/alertas?p=9999');
  await expect(page.getByRole('navigation', { name: 'Paginação' })).toContainText(new RegExp(`de ${total}`));
  await expect(page.locator('section[aria-label="Lista de alertas"] li')).toHaveCount(resto);

  // o filtro "Sem processo vinculado" reduz o total e a paginação acompanha
  await page.goto('/alertas?semprocesso=1');
  await expect(page.getByRole('navigation', { name: 'Paginação' })).toBeVisible();
});

test('ficha do processo tem a aba Andamentos com a linha do tempo e o estado de cada um', async ({ page }) => {
  await login(page);
  const num = `99${String(Date.now()).slice(-9)}`.padEnd(20, '0').slice(0, 20);
  const { rows: [c] } = await pool.query(`insert into "case" (number, portfolio) values ($1, 'civil') returning id`, [num]);
  const ins = (n: number, st: string, extra = '') => pool.query(
    `insert into movement (case_id, source, external_id, occurred_at, title, raw_text, triage_status ${extra ? ', discard_reason' : ''})
     values ($1, 'djen', $2, now() - ($3 || ' days')::interval, $4, $5, $6 ${extra ? ', $7' : ''})`,
    extra ? [c.id, `${TAG}-FIC-${n}`, n, `Título ${n}`, `${TAG} corpo ${n}`, st, extra] : [c.id, `${TAG}-FIC-${n}`, n, `Título ${n}`, `${TAG} corpo ${n}`, st],
  );
  await ins(1, 'pending'); await ins(2, 'linked'); await ins(3, 'discarded', 'Duplicado');
  try {
    await page.goto(`/processos/${c.id}?tab=andamentos`);
    await expect(page.getByRole('tab', { name: 'Andamentos (3)' })).toBeVisible();
    const lista = page.getByRole('region', { name: 'Andamentos do processo' }).locator('article');
    await expect(lista).toHaveCount(3);
    await expect(lista.nth(0)).toContainText('Título 1'); // mais recente primeiro
    await expect(lista.nth(0)).toContainText('Pendente de decisão');
    await expect(lista.nth(0).getByRole('link', { name: 'Tratar em Alertas' })).toBeVisible();
    await expect(lista.nth(1)).toContainText('Marcado como lido');
    await expect(lista.nth(2)).toContainText('Descartado: Duplicado');
    await lista.nth(0).getByText('Texto original').click();
    await expect(lista.nth(0)).toContainText(`${TAG} corpo 1`);
  } finally {
    await pool.query(`delete from movement where case_id = $1`, [c.id]);
    await pool.query(`delete from "case" where id = $1`, [c.id]);
  }
});

test('alertas tratados vão para o histórico, com a decisão e o filtro de desfecho', async ({ page }) => {
  await login(page);
  const T = `${TAG}-HIST`;
  const { rows: [m] } = await pool.query(
    `insert into movement (source, external_id, occurred_at, title, raw_text, triage_status, discard_reason, read_at)
     values ('djen', $1, now(), 'Intimação', $2, 'discarded', 'Duplicado', now()) returning id`,
    [T, `${T} texto histórico`],
  );
  await page.goto('/alertas'); // pendentes: o tratado não aparece
  await expect(page.getByText(`${T} texto histórico`)).toHaveCount(0);
  await page.goto('/alertas?vista=handled&desfecho=discarded');
  await page.locator('section[aria-label="Lista de alertas"] li', { hasText: `${T} texto histórico` }).getByRole('link').click();
  const painel = page.getByRole('complementary', { name: 'Detalhe do alerta' });
  await expect(painel).toContainText('Ignorado: Duplicado');
  await expect(painel).toContainText('Histórico do alerta');
  await expect(painel.getByRole('button', { name: 'Ignorar', exact: true })).toHaveCount(0); // tratado não tem ações
  await page.goto('/alertas?vista=handled&desfecho=task_created');
  await expect(page.getByText(`${T} texto histórico`)).toHaveCount(0);
  void m;
});

test('botão Voltar leva sempre à tela pai, não à página anterior do navegador', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('link', { name: /Voltar/ })).toHaveCount(0); // Início não tem

  // andamentos: abrir vários alertas e trocar de aba não muda o destino
  await page.goto('/tarefas');
  await page.goto('/alertas');
  await page.goto('/alertas?vista=handled');
  await page.getByRole('link', { name: /Voltar para Início/ }).click();
  await expect(page).toHaveURL(/\/inicio$/);

  await page.goto('/processos/novo');
  await page.getByRole('link', { name: /Voltar para Processos/ }).click();
  await expect(page).toHaveURL(/\/processos$/);

  await page.goto('/admin/auditoria');
  await expect(page.getByRole('link', { name: /Voltar para Início/ })).toHaveAttribute('href', '/inicio');

  // criar tarefa a partir do alerta volta aos alertas
  await page.goto('/tarefas?andamento=00000000-0000-4000-8000-000000000000');
  await expect(page.getByRole('link', { name: /Voltar para Alertas/ })).toHaveAttribute('href', '/alertas');

  // editar tarefa volta à ficha do processo da tarefa
  const { rows: [t] } = await pool.query(`select t.id, t.case_id from task t where t.case_id is not null limit 1`);
  if (t) {
    await page.goto(`/tarefas/${t.id}`);
    await expect(page.getByRole('link', { name: /Voltar para o processo/ })).toHaveAttribute('href', `/processos/${t.case_id}?tab=tarefas`);
  }
});

test('a ficha do processo volta à tela de onde veio (Tarefas, com os filtros) e, abrindo direto, à lista de Processos', async ({ page }) => {
  await login(page);
  const num = `9985${String(Date.now()).slice(-9)}`.padEnd(20, '0').slice(0, 20);
  const { rows: [c] } = await pool.query(`insert into "case" (number, portfolio) values ($1, 'civil') returning id`, [num]);
  const { rows: [t] } = await pool.query(`insert into task (case_id, title, due_date) values ($1, $2, '2031-09-11') returning id`, [c.id, `${TAG} ficha`]);
  try {
    await page.goto('/tarefas?layout=list&view=all&dia=2031-09-11');
    await page.waitForLoadState('networkidle');
    await page.locator(`a[href="/processos/${c.id}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/processos/${c.id}`));
    const voltar = page.getByRole('link', { name: /Voltar para/ });
    await expect(voltar).toContainText('Tarefas e prazos', { timeout: 15000 });
    await expect(voltar).toHaveAttribute('href', /\/tarefas\?.*layout=list/); // volta com o filtro que estava

    await page.goto('/inicio');
    await page.goto(`/processos/${c.id}`); // direto (carga completa): sem origem conhecida
    await expect(page.getByRole('link', { name: /Voltar para/ })).toContainText('Processos', { timeout: 15000 });
  } finally {
    await pool.query(`delete from task where id = $1`, [t.id]);
    await pool.query(`delete from "case" where id = $1`, [c.id]);
  }
});

test('editar tarefa volta à tela de onde veio (lista de Tarefas ou ficha do processo)', async ({ page }) => {
  await login(page);
  const num = `9986${String(Date.now()).slice(-9)}`.padEnd(20, '0').slice(0, 20);
  const { rows: [c] } = await pool.query(`insert into "case" (number, portfolio) values ($1, 'civil') returning id`, [num]);
  const { rows: [t] } = await pool.query(`insert into task (case_id, title, due_date) values ($1, $2, '2031-09-10') returning id`, [c.id, `${TAG} voltar`]);
  try {
    await page.goto('/tarefas?layout=list&view=all&dia=2031-09-10');
    await page.waitForLoadState('networkidle');
    await page.locator(`a[href="/tarefas/${t.id}"]`).click();
    await expect(page.getByRole('link', { name: /Voltar para/ })).toContainText('Tarefas e prazos');

    await page.goto('/inicio');
    await page.goto(`/processos/${c.id}?tab=tarefas`);
    await page.waitForLoadState('networkidle'); // a navegação sem recarga só existe depois que a página hidratou
    await page.locator(`a[href="/tarefas/${t.id}"]`).first().click();
    await expect(page.getByRole('link', { name: /Voltar para/ })).toContainText('ficha do processo', { timeout: 15000 });
  } finally {
    await pool.query(`delete from task where id = $1`, [t.id]);
    await pool.query(`delete from "case" where id = $1`, [c.id]);
  }
});

test('o endereço antigo /andamentos redireciona para /alertas e o menu chama a tela de Alertas', async ({ page }) => {
  await login(page);
  await page.goto('/andamentos?vista=handled');
  await expect(page).toHaveURL(/\/alertas\?vista=handled/);
  await expect(page.getByRole('heading', { name: 'Alertas', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: /^Alertas/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: /^Andamentos/ })).toHaveCount(0);
});
