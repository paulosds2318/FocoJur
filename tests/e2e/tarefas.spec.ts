import { expect, test, type Page } from '@playwright/test';

// Marcos M2 e M3: tarefas (quadro, Início) e financeiro do processo.
const ADMIN = { email: 'admin@focojur.local', password: 'AdminSenha2026' };

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name=email]', ADMIN.email);
  await page.fill('input[name=password]', ADMIN.password);
  await page.click('button[type=submit]');
  await page.waitForURL(/inicio/);
}

test('tarefas, Início e financeiro', async ({ page }) => {
  await login(page);

  // tarefa geral com prazo hoje aparece em "Prazos de hoje"
  const title = `Tarefa e2e ${Date.now()}`;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  await page.goto('/tarefas');
  await page.locator('summary:has-text("Nova tarefa")').click();
  await page.fill('input[name=title]', title);
  await page.fill('input[name=dueDate]', today);
  await page.click('button:has-text("Criar tarefa")');
  await expect(page.getByText('Tarefa criada.')).toBeVisible();

  await page.goto('/tarefas?agrupar=status'); // agrupado por situação (o padrão é por coluna/bucket)
  const card = page.locator('article', { hasText: title });
  await expect(card).toBeVisible();
  await expect(card.getByText('Limite: Hoje', { exact: true })).toBeVisible();

  // mover para "Em andamento" e depois concluir (sem revisor conclui direto)
  await card.getByText('Atribuir e mover').click();
  await card.getByLabel(`Mover tarefa ${title}`).selectOption('doing');
  const andamento = page.locator('section[aria-label="Em andamento"] article', { hasText: title });
  await expect(andamento).toBeVisible();
  await andamento.getByText('Atribuir e mover').click();
  await andamento.getByLabel(`Mover tarefa ${title}`).selectOption('done');
  await expect(page.locator('section[aria-label="Concluídas"] article', { hasText: title })).toBeVisible();

  // visão em lista e filtro "Tarefas gerais"
  await page.goto('/tarefas?view=general&layout=list');
  await expect(page.getByRole('cell', { name: title })).toBeVisible();

  // financeiro: cria processo, lança acordo pago e confere o total
  const digits = String(Date.now()).slice(-7).padStart(7, '0');
  await page.goto('/processos/novo');
  await page.fill('input[name=number]', `${digits}-00.2026.8.21.0002`);
  await page.selectOption('select[name=ownerId]', { index: 1 });
  await page.selectOption('select[name=subjectId]', { label: 'No show' });
  await page.selectOption('select[name=prognosis]', 'remote');
  await page.fill('input[name=riskTotal]', '1.000,00');
  await page.click('button:has-text("Cadastrar processo")');
  await page.waitForURL(/\/processos\/[0-9a-f-]{36}/);

  await page.getByRole('tab', { name: 'Financeiro' }).click();
  await page.locator('summary:has-text("Novo lançamento")').click();
  await page.selectOption('select[name=kind]', 'settlement');
  await page.fill('input[name=amount]', '2.000,00');
  await page.fill('input[name=paidAt]', today);
  await page.fill('input[name=sensTicket]', 'SENS-123');
  await page.click('button:has-text("Registrar lançamento")');
  await expect(page.getByText('Lançamento registrado.')).toBeVisible();
  await expect(page.getByText('Total pago:')).toContainText('R$ 2.000,00');

  // tarefa aberta no processo exige decisão ao encerrar (RF-47)
  await page.getByRole('tab', { name: /Tarefas/ }).click();
  await page.locator('summary:has-text("Nova tarefa neste processo")').click();
  await page.fill('input[name=title]', 'Subsídios do financeiro');
  await page.click('button:has-text("Criar tarefa")');
  await expect(page.getByText('Tarefa criada.')).toBeVisible();
  await page.getByRole('tab', { name: /Resumo/ }).click();
  await page.selectOption('select[name=closingReasonId]', { label: 'Acordo' });
  await page.fill('input[name=closedAt]', today);
  await page.click('button:has-text("Encerrar")');
  await page.selectOption('select[name=openTasks]', 'cancel');
  await page.click('button:has-text("Encerrar")');
  await expect(page.getByText('Monitoramento desligado')).toBeVisible();
});

test('editar tarefa: atribuir responsável no card e editar pela ficha', async ({ page }) => {
  await login(page);
  const title = `Tarefa editável ${Date.now()}`;
  await page.goto('/tarefas');
  await page.locator('summary:has-text("Nova tarefa")').click();
  await page.fill('input[name=title]', title);
  await page.click('button:has-text("Criar tarefa")');
  await expect(page.getByText('Tarefa criada.')).toBeVisible();

  await page.goto('/tarefas');
  const card = page.locator('article', { hasText: title });
  await expect(card.getByText('sem responsável', { exact: true })).toBeVisible();

  // troca rápida: o primeiro usuário da lista (o admin) vira responsável
  await card.getByText('Atribuir e mover').click();
  await card.getByRole('checkbox', { name: new RegExp(`Responsável pela tarefa ${title}: Administrador`) }).click(); // a marcação vem do servidor
  await expect(page.locator('article', { hasText: title }).getByText('sem responsável', { exact: true })).toHaveCount(0, { timeout: 15000 });
  await page.reload();
  await expect(page.locator('article', { hasText: title }).getByText('sem responsável', { exact: true })).toHaveCount(0);

  // edição completa pela ficha
  await page.locator('article', { hasText: title }).getByRole('link', { name: `Editar tarefa ${title}` }).click();
  await page.waitForURL(/\/tarefas\/[0-9a-f-]{36}/);
  await page.fill('input[name=title]', `${title} (ajustada)`);
  await page.fill('input[name=dueDate]', '2030-01-15');
  await page.click('button:has-text("Salvar alterações")');
  await expect(page.getByText('Tarefa atualizada.')).toBeVisible();
  await page.goto('/tarefas?layout=list');
  await expect(page.getByRole('cell', { name: `${title} (ajustada)` })).toBeVisible();
});
