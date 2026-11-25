import { expect, test } from '@playwright/test';

test('tema escuro persiste e "Sair da conta" encerra a sessão', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[name=email]', 'admin@focojur.local');
  await page.fill('input[name=password]', 'AdminSenha2026');
  await page.click('button[type=submit]');
  await page.waitForURL(/inicio/);

  const html = page.locator('html');
  await page.getByRole('button', { name: 'Tema' }).click(); // um clique alterna (a partir do claro, vai para o escuro)
  await expect(html).toHaveAttribute('data-theme', 'dark');
  // o fundo muda de verdade (token --color-bg do tema escuro)
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(18, 18, 20)');
  await page.screenshot({ path: 'test-results/tema-escuro.png', fullPage: false });
  // o botão fica no canto superior direito
  const box = (await page.getByRole('button', { name: 'Tema' }).boundingBox())!;
  expect(box.y).toBeLessThan(30);
  expect(box.x + box.width).toBeGreaterThan(1280 - 40);

  // continua escuro ao recarregar e em outra tela, sem piscar no claro
  await page.goto('/processos');
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('button', { name: 'Tema' }).click(); // outro clique volta ao claro
  await expect(html).toHaveAttribute('data-theme', 'light');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(246, 246, 247)');

  // o botão Sair fica visível sem rolar a página e leva ao login
  await expect(page.getByRole('button', { name: 'Sair da conta' })).toBeInViewport();
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await page.waitForURL(/login/);
  await page.goto('/inicio');
  await page.waitForURL(/login/); // sem sessão, volta ao login
});
