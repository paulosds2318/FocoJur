import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { Pool } from 'pg';

// Processos usa o mesmo paginador da Triagem: números de página, Anterior/Próxima e "Mostrando a a b de N".
const ADMIN = { email: 'admin@focojur.local', password: 'AdminSenha2026' };
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const PFX = `9977${String(Date.now()).slice(-6)}`; // 10 dígitos; o resto completa os 20

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name=email]', ADMIN.email);
  await page.fill('input[name=password]', ADMIN.password);
  await page.click('button[type=submit]');
  await page.waitForURL(/inicio/);
}

test.beforeAll(async () => {
  await pool.query(`insert into "case" (number, portfolio) select $1 || lpad(g::text, 10, '0'), 'civil' from generate_series(1, 45) g`, [PFX]);
});
test.afterAll(async () => {
  await pool.query(`delete from case_civil where case_id in (select id from "case" where number like $1)`, [`${PFX}%`]);
  await pool.query(`delete from "case" where number like $1`, [`${PFX}%`]);
  await pool.end();
});

test('processos pagina de 20 em 20 com números de página, Anterior/Próxima e a página além do fim cai na última', async ({ page }) => {
  await login(page);
  await page.goto(`/processos?q=${PFX}&status=all`);
  const pager = page.getByRole('navigation', { name: 'Paginação' });
  await expect(pager).toContainText('Mostrando 1 a 20 de 45 processos');
  await expect(page.locator('tbody tr')).toHaveCount(20);
  await expect(pager.getByRole('link', { name: '2', exact: true })).toBeVisible(); // números de página, como na Triagem
  await expect(pager.getByRole('link', { name: '3', exact: true })).toBeVisible();
  await expect(pager.getByText('Anterior')).toHaveAttribute('aria-disabled', 'true');
  const primeiro = await page.locator('tbody tr a').first().innerText();

  await pager.getByRole('link', { name: 'Próxima' }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByRole('navigation', { name: 'Paginação' })).toContainText('Mostrando 21 a 40 de 45 processos');
  expect(await page.locator('tbody tr a').first().innerText()).not.toBe(primeiro);
  await expect(page).toHaveURL(new RegExp(`q=${PFX}`)); // os filtros acompanham a página

  await page.getByRole('navigation', { name: 'Paginação' }).getByRole('link', { name: '3', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Paginação' })).toContainText('Mostrando 41 a 45 de 45 processos');
  await expect(page.locator('tbody tr')).toHaveCount(5);
  await expect(page.getByRole('navigation', { name: 'Paginação' }).getByText('Próxima')).toHaveAttribute('aria-disabled', 'true');

  await page.goto(`/processos?q=${PFX}&status=all&page=9999`); // além do fim: última página
  await expect(page.getByRole('navigation', { name: 'Paginação' })).toContainText('Mostrando 41 a 45 de 45 processos');
});
