import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { Pool } from 'pg';

// Filtros de período (mês e ano, personalizado) nos Painéis e nos Custos de IA, e o CSV de custos acompanhando o período.
const ADMIN = { email: 'admin@focojur.local', password: 'AdminSenha2026' };
const MODEL = 'E2E-PERIODO';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name=email]', ADMIN.email);
  await page.fill('input[name=password]', ADMIN.password);
  await page.click('button[type=submit]');
  await page.waitForURL(/inicio/);
}

test.beforeAll(async () => {
  await pool.query(`delete from ai_call where model = $1`, [MODEL]);
  for (const [at, brl] of [['2021-03-15T12:00:00Z', '0.5'], ['2021-05-15T12:00:00Z', '5']]) {
    await pool.query(
      `insert into ai_call (task, model, status, prompt_tokens, completion_tokens, cost_usd, fx_rate, cost_brl, at) values ('movement_summary', $1, 'ok', 10, 5, $2, 5, $3, $4)`,
      [MODEL, Number(brl) / 5, brl, at],
    );
  }
});
test.afterAll(async () => {
  await pool.query(`delete from ai_call where model = $1`, [MODEL]);
  await pool.end();
});

test('painéis: mês e ano, período personalizado, aviso de entrada inválida e carteira mantém o período', async ({ page }) => {
  await login(page);
  await page.goto('/paineis');
  await expect(page.getByText('Sem filtro de período')).toBeVisible();

  await page.getByRole('link', { name: 'Mês e ano' }).click();
  await page.selectOption('select[name=mes]', '3');
  await page.selectOption('select[name=ano]', '2021');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page).toHaveURL(/periodo=ym&mes=3&ano=2021/);
  await expect(page.getByText('março de 2021', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Entradas no período', { exact: true })).toBeVisible();
  await expect(page.getByText('12 meses até março de 2021')).toBeVisible();

  // trocar a carteira não perde o período
  await page.getByRole('link', { name: 'Cível' }).click();
  await expect(page).toHaveURL(/carteira=civil/);
  await expect(page).toHaveURL(/periodo=ym/);
  await expect(page.getByRole('heading', { name: 'Contingência por prognóstico' })).toBeVisible();

  // período personalizado
  await page.getByRole('link', { name: 'Período personalizado' }).click();
  await page.fill('input[name=de]', '2021-03-01');
  await page.fill('input[name=ate]', '2021-04-15');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page).toHaveURL(/periodo=custom&de=2021-03-01&ate=2021-04-15/);
  await expect(page.getByText('01/03/2021 a 15/04/2021').first()).toBeVisible();
  await expect(page.getByText('Encerrados no período', { exact: true })).toBeVisible();

  // entrada inválida: aviso curto, nada quebra
  for (const url of ['/paineis?periodo=custom&de=2026-05-10&ate=2026-05-01', '/paineis?periodo=ym&mes=13&ano=2026', '/paineis?periodo=custom&de=lixo&ate=<x>']) {
    await page.goto(url);
    await expect(page.getByRole('status')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Painéis', level: 1 })).toBeVisible();
    await expect(page.getByText('Runtime Error')).toHaveCount(0);
  }
});

test('custos de IA: filtros de período e CSV com exatamente o mesmo período', async ({ page }) => {
  await login(page);
  await page.goto('/admin/ia/custos');
  await expect(page.getByRole('group', { name: 'Período' }).getByRole('link')).toHaveText(['Hoje', '7 dias', 'Mês atual', 'Mês e ano', 'Período personalizado']);

  // mês e ano: março de 2021 mostra a chamada de março e o link do CSV carrega o mesmo período
  await page.getByRole('link', { name: 'Mês e ano' }).click();
  await page.selectOption('select[name=mes]', '3');
  await page.selectOption('select[name=ano]', '2021');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page).toHaveURL(/periodo=ym&mes=3&ano=2021/);
  await expect(page.getByRole('cell', { name: MODEL })).toBeVisible();
  await expect(page.getByText('Chamadas no período')).toBeVisible();
  const csvLink = page.getByRole('link', { name: 'Exportar CSV' });
  await expect(csvLink).toHaveAttribute('href', /periodo=ym&mes=3&ano=2021/);

  const csv = async (qs: string) => (await page.request.get(`/admin/ia/custos/export?${qs}`)).text();
  const marco = await csv('periodo=ym&mes=3&ano=2021');
  expect(marco).toContain(MODEL);
  expect(marco).toContain('2021-03-15');
  expect(marco).not.toContain('2021-05-15');

  // período personalizado: maio
  await page.getByRole('link', { name: 'Período personalizado' }).click();
  await page.fill('input[name=de]', '2021-05-01');
  await page.fill('input[name=ate]', '2021-05-31');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page).toHaveURL(/periodo=custom&de=2021-05-01&ate=2021-05-31/);
  await expect(page.getByRole('cell', { name: MODEL })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Exportar CSV' })).toHaveAttribute('href', /periodo=custom&de=2021-05-01&ate=2021-05-31/);
  const maio = await csv('periodo=custom&de=2021-05-01&ate=2021-05-31');
  expect(maio).toContain('2021-05-15');
  expect(maio).not.toContain('2021-03-15');

  // período que cobre os dois meses (maior que 62 dias → gráfico por mês) e período padrão sem as chamadas de 2021
  await page.goto('/admin/ia/custos?periodo=custom&de=2021-03-01&ate=2021-05-31');
  await expect(page.getByRole('heading', { name: 'Custo por mês' })).toBeVisible();
  const tudo = await csv('periodo=custom&de=2021-03-01&ate=2021-05-31');
  expect(tudo).toContain('2021-03-15');
  expect(tudo).toContain('2021-05-15');
  expect(await csv('')).not.toContain(MODEL);

  // CSV com entrada inválida cai no padrão (mês atual) em vez de dar erro
  const invalido = await page.request.get('/admin/ia/custos/export?periodo=custom&de=2026-05-10&ate=2026-05-01');
  expect(invalido.status()).toBe(200);
  expect(await invalido.text()).not.toContain(MODEL);

  // entrada inválida na tela: aviso curto, sem erro
  await page.goto('/admin/ia/custos?periodo=ym&mes=0&ano=2026');
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Custos de IA', level: 1 })).toBeVisible();
});

test('em 360 px a tela de custos com período personalizado não rola na horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await login(page);
  for (const url of ['/admin/ia/custos?periodo=custom', '/admin/ia/custos?periodo=ym', '/paineis?periodo=custom&de=2021-01-01&ate=2024-12-31']) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
});
