import { expect, test } from '@playwright/test';

// Marco M1: cadastrar, revisar prognóstico, encerrar e buscar um processo cível, com auditoria.
// Depende do admin do seed já ter feito o primeiro acesso (rodar primeiro-acesso.spec.ts antes).
const ADMIN = { email: 'admin@focojur.local', password: 'AdminSenha2026' };

test('cadastro, busca, revisão e encerramento de processo', async ({ page }) => {
  const digits = String(Date.now()).slice(-7).padStart(7, '0');
  const number = `${digits}-00.2026.8.21.0001`;

  await page.goto('/login');
  await page.fill('input[name=email]', ADMIN.email);
  await page.fill('input[name=password]', ADMIN.password);
  await page.click('button[type=submit]');
  await page.waitForURL(/inicio/);

  await page.goto('/processos/novo');
  await page.fill('input[name=number]', number);

  // RF-48: cível exige responsável, objeto, prognóstico e risco
  await page.click('button:has-text("Cadastrar processo")');
  await expect(page.locator('p[role=alert]')).toContainText('responsável');

  await page.selectOption('select[name=ownerId]', { index: 1 });
  await page.selectOption('select[name=subjectId]', { label: '404' });
  await page.selectOption('select[name=prognosis]', 'possible');
  await page.fill('input[name=plaintiff]', 'Renata Teste');
  await page.fill('input[name=riskTotal]', '7.450,00');
  await page.fill('input[name=riskMaterial]', '8.000,00');
  await page.click('button:has-text("Cadastrar processo")');
  await expect(page.locator('p[role=alert]')).toContainText('Material + moral');

  await page.fill('input[name=riskMaterial]', '2.450,00');
  await page.fill('input[name=riskMoral]', '5.000,00');
  await page.click('button:has-text("Cadastrar processo")');
  await page.waitForURL(/\/processos\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(number);
  await expect(page.getByText('R$ 7.450,00').first()).toBeVisible();

  // duplicado na mesma carteira é recusado
  await page.goto('/processos/novo');
  await page.fill('input[name=number]', number);
  await page.selectOption('select[name=ownerId]', { index: 1 });
  await page.selectOption('select[name=subjectId]', { label: '404' });
  await page.selectOption('select[name=prognosis]', 'possible');
  await page.fill('input[name=riskTotal]', '100,00');
  await page.click('button:has-text("Cadastrar processo")');
  await expect(page.locator('p[role=alert]')).toContainText('Já existe');

  // busca pelo nome da parte
  await page.goto('/processos?q=Renata+Teste');
  await page.getByRole('link', { name: number }).first().click();

  // revisão de prognóstico guarda histórico
  await page.locator('summary:has-text("Revisar prognóstico")').click();
  await page.selectOption('form:has(button:has-text("Registrar revisão")) select[name=prognosis]', 'probable');
  await page.locator('form:has(button:has-text("Registrar revisão")) input[name=riskTotal]').fill('9.000,00');
  await page.click('button:has-text("Registrar revisão")');
  await expect(page.getByText('2 revisão(ões)')).toBeVisible();

  // encerrar exige motivo e data; desliga o monitoramento
  await page.selectOption('select[name=closingReasonId]', { label: 'Acordo' });
  await page.fill('input[name=closedAt]', '2026-11-16');
  await page.click('button:has-text("Encerrar")');
  await expect(page.getByText('Monitoramento desligado')).toBeVisible();

  // histórico de auditoria
  await page.getByRole('tab', { name: 'Histórico' }).click();
  await expect(page.getByText('revisou o prognóstico')).toBeVisible();
  await expect(page.getByText('criou o processo')).toBeVisible();
});
