import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { Pool } from 'pg';

// Tarefas e prazos no padrão do Planner: quadro por coluna (bucket), concluir pelo círculo, calendário e grade.
const ADMIN = { email: 'admin@focojur.local', password: 'AdminSenha2026' };
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TS = Date.now();
const TAG = `E2E-QDR-${TS}`;
const BUCKET = 'Tarefas pendentes';

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name=email]', ADMIN.email);
  await page.fill('input[name=password]', ADMIN.password);
  await page.click('button[type=submit]');
  await page.waitForURL(/inicio/);
}
const bucketId = async (label: string) => (await pool.query(`select id from lookup where type = 'task_bucket' and label = $1`, [label])).rows[0].id as string;

test.afterAll(async () => {
  const { rows } = await pool.query(`select id from task where title like $1`, [`${TAG}%`]);
  const ids = rows.map((r) => String(r.id));
  await pool.query(`delete from task where title like $1`, [`${TAG}%`]);
  if (ids.length) await pool.query(`delete from audit_log where entity_id = any($1::text[])`, [ids]);
  await pool.end();
});

test('quadro por coluna: adicionar tarefa na coluna, mover de coluna e concluir pelo círculo', async ({ page }) => {
  await login(page);
  await page.goto('/tarefas');
  const col = (name: string) => page.locator(`section[aria-label="${name}"]`);
  await expect(col('Sem bucket')).toBeVisible();
  await expect(col(BUCKET)).toBeVisible();

  // "+ Adicionar tarefa" no topo da coluna cria a tarefa já nela
  const title = `${TAG} rapida`;
  await col(BUCKET).getByRole('button', { name: /Adicionar tarefa/ }).click();
  await col(BUCKET).getByLabel(`Título da nova tarefa em ${BUCKET}`).fill(title);
  await col(BUCKET).getByRole('button', { name: 'Criar' }).click();
  await expect(col(BUCKET).locator('article', { hasText: title })).toBeVisible();
  const { rows: [t] } = await pool.query(`select bucket_id, case_id from task where title = $1`, [title]);
  expect(t.bucket_id).toBe(await bucketId(BUCKET));
  expect(t.case_id).toBeNull();

  // mover para outra coluna pelo seletor do card
  const card = col(BUCKET).locator('article', { hasText: title });
  await card.getByText('Atribuir e mover').click();
  await card.getByLabel(`Coluna da tarefa ${title}`).selectOption({ label: 'Trabalhista' });
  await expect(col('Trabalhista').locator('article', { hasText: title })).toBeVisible();
  await expect(col(BUCKET).locator('article', { hasText: title })).toHaveCount(0);

  // círculo: conclui e a tarefa vai para "Tarefas concluídas" da própria coluna (recolhida)
  await col('Trabalhista').getByRole('button', { name: `Concluir tarefa ${title}` }).click();
  await expect(col('Trabalhista').getByText(/Tarefas concluídas/)).toBeVisible();
  await expect(col('Trabalhista').locator('article', { hasText: title })).toBeHidden(); // recolhida
  await col('Trabalhista').getByText(/Tarefas concluídas/).click();
  await expect(col('Trabalhista').locator('article', { hasText: title })).toBeVisible();
  // reabrir pelo círculo
  await col('Trabalhista').getByRole('button', { name: `Reabrir tarefa ${title}` }).click();
  await expect(col('Trabalhista').getByRole('button', { name: `Concluir tarefa ${title}` })).toBeVisible();
});

test('calendário mostra a tarefa no dia do prazo limite e do interno; "não agendadas" ao lado; o dia leva à grade', async ({ page }) => {
  await login(page);
  const lim = `${TAG} limite`;
  const sem = `${TAG} semdata`;
  await pool.query(`insert into task (title, due_date, internal_due_date) values ($1, '2031-10-15', '2031-10-13')`, [lim]);
  await pool.query(`insert into task (title) values ($1)`, [sem]);

  await page.goto('/tarefas?layout=calendar&ancora=2031-10-15');
  await expect(page.getByRole('heading', { name: 'outubro de 2031' })).toBeVisible();
  const dia = (d: string) => page.locator(`[data-day="${d}"]`);
  await expect(dia('2031-10-15').getByRole('link', { name: lim })).toBeVisible();
  await expect(dia('2031-10-13').getByRole('link', { name: `Int. ${lim}` })).toBeVisible();
  const lateral = page.getByRole('complementary', { name: 'Tarefas não agendadas' });
  await expect(lateral).toContainText(sem);
  await expect(lateral).not.toContainText(lim);

  // semana e navegação
  await page.getByRole('link', { name: 'Semana', exact: true }).click();
  await expect(page).toHaveURL(/modo=week/);
  await expect(dia('2031-10-15').getByRole('link', { name: lim })).toBeVisible();
  await page.getByRole('link', { name: 'Próxima semana' }).click();
  await expect(page.getByRole('link', { name: lim })).toHaveCount(0);

  // clicar no número do dia abre a grade filtrada por aquele dia
  await page.goto('/tarefas?layout=calendar&ancora=2031-10-15');
  await page.getByRole('link', { name: 'Tarefas do dia 15/10/2031' }).click();
  await expect(page).toHaveURL(/dia=2031-10-15/);
  await expect(page.getByRole('cell', { name: lim })).toBeVisible();
});

test('a barra de rolagem horizontal do quadro fica fixa no rodapé da janela e rola o quadro', async ({ page }) => {
  await login(page);
  await page.goto('/tarefas');
  const barra = page.getByTestId('barra-rolagem-fixa');
  await expect(barra).toBeVisible();
  const vh = page.viewportSize()!.height;
  const box = await barra.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(vh + 1); // dentro da janela, sem precisar rolar a página
  expect(box!.y + box!.height).toBeGreaterThan(vh - 40); // colada no rodapé

  // rolar a barra fixa rola o quadro
  await barra.evaluate((el) => { el.scrollLeft = 400; });
  await expect.poll(() => page.evaluate(() => document.querySelector('section[aria-label="Sem bucket"]')!.parentElement!.parentElement!.scrollLeft)).toBeGreaterThan(300);
});

test('calendário: "+N mais" abre um pop-up com todas as tarefas do dia, sem sair da tela', async ({ page }) => {
  await login(page);
  for (let i = 1; i <= 5; i++) await pool.query(`insert into task (title, due_date) values ($1, '2031-11-20')`, [`${TAG} dia ${i}`]);

  await page.goto('/tarefas?layout=calendar&ancora=2031-11-20');
  const celula = page.locator('[data-day="2031-11-20"]');
  await expect(celula.getByRole("link", { name: new RegExp(`${TAG} dia`) })).toHaveCount(3); // só 3 na célula
  await celula.getByRole('button', { name: '+2 mais' }).click();

  const popup = page.getByRole('dialog', { name: 'Tarefas de 20/11/2031' });
  await expect(popup).toBeVisible();
  await expect(page).toHaveURL(/layout=calendar/); // continua no calendário
  for (let i = 1; i <= 5; i++) await expect(popup.getByRole('link', { name: new RegExp(`${TAG} dia ${i}`) })).toBeVisible();
  await expect(popup).toContainText('· 5');

  await page.keyboard.press('Escape'); // Esc fecha
  await expect(popup).toBeHidden();

  await celula.getByRole('button', { name: '+2 mais' }).click();
  await popup.getByRole('button', { name: 'Fechar' }).click(); // botão fecha
  await expect(popup).toBeHidden();
});

test('vários responsáveis por tarefa: marcar no card, ver todos os avatares, editar na ficha e criar já com mais de um', async ({ page }) => {
  await login(page);
  const nome = `E2E Multi ${TS}`;
  const { rows: [adm] } = await pool.query(`select id, name from "user" where email = $1`, ['admin@focojur.local']);
  const { rows: [extra] } = await pool.query(
    `insert into "user" (id, name, email, email_verified, role, active, created_at, updated_at) values ($1, $2, $3, true, 'lawyer', true, now(), now()) returning id`,
    [`e2e-multi-${TS}`, nome, `e2e-multi-${TS}@teste.com`],
  );
  try {
    const titulo = `${TAG} multi`;
    const { rows: [t] } = await pool.query(`insert into task (title) values ($1) returning id`, [titulo]);

    await page.goto('/tarefas');
    const card = page.locator('article', { hasText: titulo });
    await card.getByText('Atribuir e mover').click();
    await card.getByRole('checkbox', { name: new RegExp(`${titulo}: ${adm.name}$`) }).click(); // a marcação vem do servidor
    await expect(card.getByLabel(`Responsável: ${adm.name}`)).toBeVisible();
    await card.getByRole('checkbox', { name: new RegExp(`${titulo}: ${nome}$`) }).click();
    await expect(card.getByLabel(`Responsável: ${nome}`)).toBeVisible(); // os dois avatares
    await expect(card.getByLabel(`Responsável: ${adm.name}`)).toBeVisible();
    const { rows: ass } = await pool.query(`select user_id from task_assignee where task_id = $1 order by created_at`, [t.id]);
    expect(ass.map((r) => r.user_id)).toEqual([adm.id, extra.id]);
    const { rows: [tk] } = await pool.query(`select owner_id from task where id = $1`, [t.id]);
    expect(tk.owner_id).toBe(adm.id); // o primeiro fica como principal

    // filtro por responsável acha a tarefa por qualquer um dos dois; "Minhas" também
    await page.goto(`/tarefas?layout=list&resp=${extra.id}`);
    await expect(page.getByRole('cell', { name: titulo })).toBeVisible();
    await expect(page.locator('tr', { hasText: titulo })).toContainText(nome);
    await page.goto('/tarefas?layout=list&resp=none');
    await expect(page.getByRole('cell', { name: titulo })).toHaveCount(0);

    // na ficha, os dois vêm marcados; tirar um e salvar
    await page.goto(`/tarefas/${t.id}`);
    await expect(page.getByRole('checkbox', { name: `Responsável: ${nome}` })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: `Responsável: ${adm.name}` })).toBeChecked();
    await page.getByRole('checkbox', { name: `Responsável: ${adm.name}` }).uncheck();
    await page.click('button:has-text("Salvar alterações")');
    await expect(page.getByText('Tarefa atualizada.')).toBeVisible();
    const { rows: depois } = await pool.query(`select user_id from task_assignee where task_id = $1`, [t.id]);
    expect(depois.map((r) => r.user_id)).toEqual([extra.id]);
    const { rows: [t2] } = await pool.query(`select owner_id from task where id = $1`, [t.id]);
    expect(t2.owner_id).toBe(extra.id); // o principal acompanha

    // criar já com dois responsáveis
    await page.goto('/tarefas');
    await page.locator('summary:has-text("Nova tarefa")').click();
    await page.fill('input[name=title]', `${TAG} nova com dois`);
    await page.getByRole('checkbox', { name: `Responsável: ${nome}` }).first().check();
    await page.getByRole('checkbox', { name: `Responsável: ${adm.name}` }).first().check();
    await page.click('button:has-text("Criar tarefa")');
    await expect(page.getByText('Tarefa criada.')).toBeVisible();
    const { rows: [n] } = await pool.query(`select id, owner_id from task where title = $1`, [`${TAG} nova com dois`]);
    expect(n.owner_id).toBe(extra.id);
    const { rows: dois } = await pool.query(`select user_id from task_assignee where task_id = $1`, [n.id]);
    expect(dois.map((r) => r.user_id).sort()).toEqual([adm.id, extra.id].sort());
  } finally {
    await pool.query(`delete from task_assignee where user_id = $1`, [extra.id]);
    await pool.query(`delete from task where title like $1`, [`${TAG}%`]);
    await pool.query(`delete from "user" where id = $1`, [extra.id]);
  }
});
