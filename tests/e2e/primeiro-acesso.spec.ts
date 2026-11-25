import { expect, test } from '@playwright/test';

// Marco M0: admin semeado cria uma advogada; ela entra com a senha temporária,
// cria a definitiva e vê o layout. Requer `pnpm db:seed` e o Postgres no ar.
const ADMIN = { email: 'admin@focojur.local', password: 'Trocar12345', next: 'AdminSenha2026' };

test('fluxo completo de criação de usuário e primeiro acesso', async ({ page, browser }) => {
  const email = `adv${Date.now()}@teste.com`;

  // admin: primeiro acesso (se ainda for a senha do seed) e criação da advogada
  await page.goto('/login');
  await page.fill('input[name=email]', ADMIN.email);
  // tenta primeiro a senha definitiva (execuções seguintes); no banco recém-semeado cai na senha do seed
  await page.fill('input[name=password]', ADMIN.next);
  await page.click('button[type=submit]');
  const rejected = await page.locator('p[role=alert]').waitFor({ timeout: 4000 }).then(() => true, () => false);
  if (rejected) {
    await page.goto('/login');
    await page.fill('input[name=email]', ADMIN.email);
    await page.fill('input[name=password]', ADMIN.password);
    await page.click('button[type=submit]');
  }
  await page.waitForURL((u) => !u.pathname.includes('login'));
  await page.goto('/inicio'); // assenta o redirecionamento do layout
  if (page.url().includes('primeiro-acesso')) {
    await page.fill('input[name=password]', ADMIN.next);
    await page.fill('input[name=confirm]', ADMIN.next);
    await page.click('button[type=submit]');
    await page.waitForURL(/inicio/);
  }
  await page.goto('/admin/usuarios');
  await page.fill('input[name=name]', 'Beatriz Santos');
  await page.fill('input[name=email]', email);
  await page.click('button:has-text("Criar usuário")');
  const temp = (await page.locator('[role=status] code').innerText()).trim();
  expect(temp).toHaveLength(12);

  // advogada: entra, é forçada à troca, não acessa outras rotas antes
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('http://localhost:3100/login');
  await p2.fill('input[name=email]', email);
  await p2.fill('input[name=password]', temp);
  await p2.click('button[type=submit]');
  await p2.waitForURL(/primeiro-acesso/);
  await p2.goto('http://localhost:3100/inicio');
  await p2.waitForURL(/primeiro-acesso/);

  // senha igual à temporária é recusada
  await p2.fill('input[name=password]', temp);
  await p2.fill('input[name=confirm]', temp);
  await p2.click('button[type=submit]');
  await expect(p2.locator('p[role=alert]')).toContainText('diferente');

  await p2.fill('input[name=password]', 'SenhaNova2026');
  await p2.fill('input[name=confirm]', 'SenhaNova2026');
  await p2.click('button[type=submit]');
  await p2.waitForURL(/inicio/);
  await expect(p2.getByRole('heading', { name: /(Bom dia|Boa tarde|Boa noite), Beatriz/ })).toBeVisible();

  // advogada não é admin: não vê a tela de usuários
  await p2.goto('http://localhost:3100/admin/usuarios');
  await p2.waitForURL(/inicio/);
});
