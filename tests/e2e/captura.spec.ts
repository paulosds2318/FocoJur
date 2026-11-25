import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { Pool } from 'pg';

// Marco M6/M7: caixa de entrada, triagem e telas de administração (IA, custos, monitoramento).
const ADMIN = { email: 'admin@focojur.local', password: 'AdminSenha2026' };

const addTermForm = (page: Page) => page.locator('form', { has: page.getByRole('button', { name: 'Adicionar termo' }) });

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name=email]', ADMIN.email);
  await page.fill('input[name=password]', ADMIN.password);
  await page.click('button[type=submit]');
  await page.waitForURL(/inicio/);
}

test('triagem: cadastro pelo número, revisão e confirmação criam o processo', async ({ page }) => {
  await login(page);
  const digits = `9997${String(Date.now()).slice(-3)}`.padEnd(7, '0');
  const number = `${digits}-00.2026.8.21.0001`;

  await page.goto('/triagem');
  await page.locator('summary:has-text("Cadastrar pelo número")').click();
  await page.fill('input[name=number]', number);
  await page.click('button:has-text("Adicionar")');
  await expect(page.getByText('Item criado na caixa de entrada.')).toBeVisible();

  // a Caixa de entrada é só consulta: mostra o item, sem botões de decisão, e aponta para a Triagem
  await page.goto('/caixa-entrada');
  await page.getByRole('link', { name: number }).first().click();
  await expect(page.getByRole('link', { name: 'Classificar na Triagem' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar e criar processo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Descartar' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Classificar na Triagem' }).click();
  await page.waitForURL(/\/triagem\?item=/);
  await expect(page.getByRole('heading', { name: number })).toBeVisible();
  await page.fill('input[name=plaintiff]', 'Fulana Caixa');
  await page.selectOption('select[name=subjectId]', { label: 'No show' });
  await page.selectOption('select[name=prognosis]', 'remote');
  await page.fill('input[name=riskTotal]', '500,00');
  // classificar já pode gerar a tarefa com prazo, sem IA
  await page.fill('input[name=taskTitle]', 'Contestação e2e');
  await page.fill('input[name=taskDue]', '2030-03-15');
  await page.click('button:has-text("Confirmar e criar processo")');
  await page.waitForURL(/\/processos\/[0-9a-f-]{36}/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(number);
  await page.getByRole('tab', { name: /Tarefas/ }).click();
  await expect(page.getByRole('cell', { name: 'Contestação e2e' })).toBeVisible();

  // o mesmo número de novo é marcado como possível duplicado
  await page.goto('/triagem');
  await page.locator('summary:has-text("Cadastrar pelo número")').click();
  await page.fill('input[name=number]', number);
  await page.click('button:has-text("Adicionar")');
  await expect(page.getByText('marcado como possível duplicado')).toBeVisible();
});

test('triagem e telas de IA e monitoramento carregam sem erro', async ({ page }) => {
  await login(page);
  for (const [url, heading] of [
    ['/triagem', 'Triagem'], ['/alertas', 'Alertas'], ['/admin/ia', 'Modelos de IA'], ['/admin/ia/custos', 'Custos de IA'],
    ['/admin/monitoramento', 'Monitoramento'], ['/caixa-entrada', 'Caixa de entrada'], ['/inicio', null],
  ] as const) {
    await page.goto(url);
    if (heading) await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await expect(page.getByText('Runtime Error')).toHaveCount(0);
  }
  // termo de nome exige documento (anti-homônimo)
  await page.goto('/admin/monitoramento');
  const form = addTermForm(page);
  await form.locator('select[name=kind]').selectOption('name');
  await form.locator('input[name=term]').fill('NOME SEM DOCUMENTO');
  await form.getByRole('button', { name: 'Adicionar termo' }).click();
  await expect(page.getByText('informe o CNPJ para conferir homônimos')).toBeVisible();
});

test('feriados, comparação de modelos e conectores abrem sem erro', async ({ page }) => {
  await login(page);
  for (const [url, heading] of [['/admin/feriados', 'Feriados e calendário forense'], ['/admin/ia', 'Modelos de IA'], ['/conectores', 'Situação dos conectores']] as const) {
    await page.goto(url);
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await expect(page.getByText('Runtime Error')).toHaveCount(0);
  }
  // cadastro de feriado estadual exige a UF; depois some da lista
  await page.goto('/admin/feriados');
  await page.fill('input[name=date]', '2031-05-05');
  await page.fill('input[name=description]', 'Feriado e2e');
  await page.click('button:has-text("Cadastrar feriado")');
  await expect(page.getByText('Feriado estadual precisa da UF.')).toBeVisible();
  await page.fill('input[name=state]', 'ZZ');
  await page.click('button:has-text("Cadastrar feriado")');
  await expect(page.getByText('Feriado cadastrado.')).toBeVisible();
  await page.goto('/admin/feriados?ano=2031');
  const row = page.locator('tr', { hasText: 'Feriado e2e' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Excluir' }).click();
  await expect(page.locator('tr', { hasText: 'Feriado e2e' })).toHaveCount(0);
  // comparar modelos sem gabarito/chave devolve mensagem clara, não erro
  await page.goto('/admin/ia');
  await page.fill('input[name=a]', 'modelo/a');
  await page.fill('input[name=b]', 'modelo/b');
  await page.click('button:has-text("Rodar comparação")');
  await expect(page.getByRole('alert').filter({ hasText: /OPENROUTER_API_KEY|gabarito|diferentes/ })).toBeVisible();
});

test('admin altera os termos de busca e cadastra loja sem mexer no código', async ({ page }) => {
  await login(page);
  await page.goto('/admin/monitoramento');
  await expect(page.getByRole('heading', { name: 'Monitoramento', level: 1 })).toBeVisible();

  // termo inválido é explicado; válido entra, é editado e excluído
  const form = addTermForm(page);
  await form.locator('select[name=kind]').selectOption('oab');
  await form.locator('input[name=term]').fill('77777');
  await form.getByRole('button', { name: 'Adicionar termo' }).click();
  await expect(page.getByText('OAB no formato número/UF')).toBeVisible();
  await form.locator('input[name=term]').fill('77777 zz');
  await form.getByRole('button', { name: 'Adicionar termo' }).click();
  await expect(page.getByText('Termo adicionado.')).toBeVisible();
  const row = page.locator('tr', { hasText: '77777/ZZ' });
  // a busca do termo novo começa sozinha em segundo plano e o andamento aparece na linha
  await expect(row.getByText(/Na fila|Buscando|Concluída|Erro/).first()).toBeVisible({ timeout: 20_000 });
  await row.locator('summary').click();
  await row.locator('input[name=term]').fill('77778/ZZ');
  await row.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('tr', { hasText: '77778/ZZ' })).toBeVisible();
  await page.locator('tr', { hasText: '77778/ZZ' }).getByRole('button', { name: 'Excluir' }).click();
  await expect(page.locator('tr', { hasText: '77778/ZZ' })).toHaveCount(0);

  // advogado com nome incompleto é recusado (foi o caso que não retornou nada na busca real)
  await form.locator('select[name=kind]').selectOption('lawyer');
  await form.locator('input[name=term]').fill('Sergio Cahu');
  await form.getByRole('button', { name: 'Adicionar termo' }).click();
  await expect(page.getByText('nome COMPLETO do advogado')).toBeVisible();

  // loja nova: CNPJ inválido é recusado
  const lojaForm = page.locator('form', { has: page.getByRole('button', { name: 'Cadastrar loja / empresa' }) });
  await lojaForm.locator('input[name=cnpj]').fill('07.730.797/0099-99');
  await lojaForm.locator('input[name=label]').fill('Loja e2e');
  await lojaForm.getByRole('button', { name: 'Cadastrar loja / empresa' }).click();
  await expect(page.getByText('CNPJ inválido')).toBeVisible();
});


test('caixa de entrada pagina os processos e a busca filtra por número', async ({ page }) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const PFX = `9981${String(Date.now()).slice(-5)}`;
  // 60 itens para conferir (o que vem do DJEN já entra direto em Processos; aqui entram os que pedem conferência)
  await pool.query(
    `insert into inbox_item (source, case_number, status, parsed) select 'djen_term', $1 || lpad(g::text, 20 - length($1), '0'), 'new', '{}'::jsonb from generate_series(1, 60) g`,
    [PFX],
  );
  try {
  await login(page);
  await page.goto('/caixa-entrada?filtro=djen');
  const pager = page.getByRole('navigation', { name: 'Paginação' });
  await expect(pager).toContainText(/Mostrando 1 a 25 de [\d.]+ processos/);
  const primeiro = await page.locator('tbody tr a').first().innerText();

  await pager.getByRole('link', { name: 'Próxima' }).click();
  await expect(page).toHaveURL(/p=2/);
  await expect(page.getByRole('navigation', { name: 'Paginação' })).toContainText(/Mostrando 26 a 50 de/);
  expect(await page.locator('tbody tr a').first().innerText()).not.toBe(primeiro); // outra página, outros processos

  // número da página direto na URL além do fim cai na última página; busca por número acha o processo
  await page.goto('/caixa-entrada?filtro=djen&p=9999');
  await expect(page.getByRole('navigation', { name: 'Paginação' })).toContainText(/Mostrando \d+ a \d+ de/);
  await page.goto(`/caixa-entrada?filtro=djen&q=${encodeURIComponent(primeiro)}`);
  await expect(page.locator('tbody tr a')).toHaveCount(1);
  await expect(page.getByRole('link', { name: primeiro })).toBeVisible();
  } finally {
    await pool.query(`delete from inbox_item where case_number like $1`, [`${PFX}%`]);
    await pool.end();
  }
});

test('monitoramento oferece só intervalos em horas e o intervalo escolhido vale para tudo', async ({ page }) => {
  await login(page);
  await page.goto('/admin/monitoramento');
  const opcoes = await page.locator('select[name=horas] option').allInnerTexts();
  expect(opcoes.join('|')).not.toMatch(/dia/i); // nada de 7, 30 ou 90 dias
  for (const t of ['1 hora', '6 horas', '12 horas', '24 horas']) expect(opcoes.join('|')).toContain(t);

  const freq = page.locator('section', { has: page.getByRole('heading', { name: 'Frequência da consulta automática' }) });
  const salvar = async (h: string) => {
    await freq.locator('select[name=horas]').selectOption(h);
    await freq.getByRole('button', { name: 'Salvar intervalo' }).click();
    await expect(page.getByText('Intervalo salvo.')).toBeVisible();
    await page.reload();
  };

  await salvar('6');
  await expect(freq).toContainText('a cada 6 horas');
  // o intervalo vira o padrão dos seletores de período (por termo e "Rodar agora")
  await expect(page.locator('select[aria-label="Período da busca em horas"]').first()).toHaveValue('6');
  await expect(page.locator('select[name=horas]').last()).toHaveValue(''); // "Rodar agora": janela automática
  await expect(page.getByRole('option', { name: 'Janela automática (6 horas)' })).toBeAttached();

  await salvar('1'); // padrão do sistema: a cada 1 hora
  await expect(freq).toContainText('a cada 1 hora');
  await expect(page.locator('select[aria-label="Período da busca em horas"]').first()).toHaveValue('1');
  await expect(page.getByRole('option', { name: 'Janela automática (1 hora)' })).toBeAttached();
});

test('triagem: botão "Buscar dados públicos (DataJud)" mostra o resultado sem erro (tribunal não reconhecido, sem chamada ao CNJ)', async ({ page }) => {
  await login(page);
  const number = `9990078${String(Date.now()).slice(-4)}${'2026'}1000099`; // J=1: sem índice no DataJud, a consulta nem sai
  await page.goto('/triagem');
  await page.locator('summary:has-text("Cadastrar pelo número")').click();
  await page.fill('input[name=number]', number);
  await page.click('button:has-text("Adicionar")');
  await expect(page.getByText('Item criado na caixa de entrada.')).toBeVisible();

  await page.goto('/triagem');
  await page.getByRole('link', { name: number.replace(/^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/, '$1-$2.$3.$4.$5.$6') }).first().click();
  await expect(page.getByRole('button', { name: 'Buscar no portal' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Buscar dados públicos (DataJud)' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Não foi possível identificar o tribunal' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Última tentativa:.*sem dados/)).toBeVisible();
  await expect(page.getByText('Runtime Error')).toHaveCount(0);
  await page.getByRole('button', { name: 'Descartar' }).first().click(); // limpa o item de teste
});
