import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { Pool } from 'pg';

// O botão Voltar (rótulo comprido, com o número do processo) em celular de 360 px: cabe, quebra a linha e a tela não rola na horizontal.
const ADMIN = { email: 'admin@focojur.local', password: 'AdminSenha2026' };
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TS = Date.now();
const NUM = `9979${String(TS).slice(-9)}0000000`.slice(0, 20);

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name=email]', ADMIN.email);
  await page.fill('input[name=password]', ADMIN.password);
  await page.click('button[type=submit]');
  await page.waitForURL(/inicio/);
}

test.afterAll(async () => {
  await pool.query(`delete from task where title like $1`, [`E2E-VOLTAR-${TS}%`]);
  await pool.query(`delete from case_civil where case_id in (select id from "case" where number = $1)`, [NUM]);
  await pool.query(`delete from "case" where number = $1`, [NUM]);
  await pool.end();
});

test.use({ viewport: { width: 360, height: 740 } });

test('em 360 px o Voltar com rótulo comprido cabe na tela e não cria rolagem horizontal', async ({ page }) => {
  await login(page);
  const { rows: [c] } = await pool.query(`insert into "case" (number, portfolio) values ($1, 'civil') returning id`, [NUM]);
  const { rows: [t] } = await pool.query(`insert into task (case_id, title, due_date) values ($1, $2, '2031-09-10') returning id`, [c.id, `E2E-VOLTAR-${TS} tarefa`]);

  for (const url of [`/tarefas/${t.id}`, `/processos/${c.id}`, '/admin/importacao', '/tarefas?layout=calendar']) {
    await page.goto(url);
    const voltar = page.getByRole('link', { name: /Voltar para/ });
    await expect(voltar).toBeVisible();
    const box = (await voltar.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${url}: o botão passa da largura da tela`).toBeLessThanOrEqual(360);
    expect(box.y, `${url}: o botão fica fora da primeira tela (o menu empurra o conteúdo)`).toBeLessThan(740);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${url}: a página rola na horizontal`).toBeLessThanOrEqual(1);
  }
});

test('em 360 px o menu vem recolhido, abre pelo botão Menu e fecha ao trocar de tela', async ({ page }) => {
  await login(page);
  await page.goto('/tarefas');
  const menu = page.getByRole('navigation', { name: 'Menu principal' });
  await expect(menu.getByRole('link', { name: 'Processos' })).toBeHidden(); // recolhido
  const botao = menu.getByRole('button', { name: /Menu/ });
  await expect(botao).toBeVisible();
  await botao.click();
  await expect(menu.getByRole('link', { name: 'Processos' })).toBeVisible();
  await menu.getByRole('link', { name: 'Processos' }).click();
  await expect(page).toHaveURL(/\/processos/);
  await expect(menu.getByRole('link', { name: 'Painéis' })).toBeHidden(); // fechou sozinho
});

test('em tela larga o menu continua sempre aberto e sem o botão Menu', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  const menu = page.getByRole('navigation', { name: 'Menu principal' });
  await expect(menu.getByRole('link', { name: 'Processos' })).toBeVisible();
  await expect(menu.getByRole('button', { name: /^.?\s*Menu$/ })).toHaveCount(0);
});
