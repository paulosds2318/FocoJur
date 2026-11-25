import { expect, test } from '@playwright/test';

test('painéis carregam com indicadores e filtro por carteira', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name=email]', 'admin@focojur.local');
  await page.fill('input[name=password]', 'AdminSenha2026');
  await page.click('button[type=submit]');
  await page.waitForURL(/inicio/);
  for (const url of ['/paineis', '/paineis?carteira=civil', '/paineis?carteira=labor', '/paineis?carteira=procon']) {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Painéis', level: 1 })).toBeVisible();
    await expect(page.getByText('Contingência por prognóstico')).toBeVisible();
    await expect(page.getByText('Runtime Error')).toHaveCount(0); // sem overlay de erro
  }
});
