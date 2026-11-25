import 'dotenv/config';
import ExcelJS from 'exceljs';
import { expect, test, type Page } from '@playwright/test';
import { Pool } from 'pg';

// Tela "Importação da base": enviar a planilha, conferir o de-para, ver a prévia, importar e acompanhar.
const ADMIN = { email: 'admin@focojur.local', password: 'AdminSenha2026' };
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TS = Date.now();
const FILE = `TESTE-IMP-E2E-${TS}.xlsx`;
const PFX = `9983${String(TS).slice(-6)}`;
const N = (i: number) => `${PFX}${i}0220268210001`.slice(0, 20);
const fmt = (d: string) => `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}`;
const HEADERS = ['Número do processo', 'Advogada responsável', 'Sistema', 'UF', 'Vara', 'Demandante', 'Objeto', 'Prognóstico', 'Valor da causa', 'Valor de risco', 'Status'];

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name=email]', ADMIN.email);
  await page.fill('input[name=password]', ADMIN.password);
  await page.click('button[type=submit]');
  await page.waitForURL(/inicio/);
}

async function planilha() {
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet('Cível 2026');
  a.addRow(HEADERS);
  a.addRow([fmt(N(1)), '', 'PJe', 'RS', '1ª Vara', 'Fulano E2E', 'No show', 'Possível', 1000, 500, 'Em andamento']);
  a.addRow([fmt(N(2)), '', 'PJe', 'RS', '2ª Vara', 'Beltrano E2E', 'No show', 'Provável', 2000, 2000, 'Em andamento']);
  const b = wb.addWorksheet('Cível encerrados');
  b.addRow(HEADERS);
  b.addRow([fmt(N(3)), '', 'PJe', 'RS', '1ª Vara', 'Cicrano E2E', 'No show', 'Remoto', 3000, 0, 'Encerrado']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test.afterAll(async () => {
  for (const t of ['case_civil', 'case_labor', 'case_procon', 'case_party', 'case_risk', 'rental_link', 'movement']) {
    await pool.query(`delete from ${t} where case_id in (select id from "case" where number like $1)`, [`${PFX}%`]);
  }
  await pool.query(`delete from inbox_item where case_number like $1`, [`${PFX}%`]);
  await pool.query(`delete from "case" where number like $1`, [`${PFX}%`]);
  await pool.query(`delete from audit_log where entity = 'base_import' and entity_id in (select id::text from base_import where file_name = $1)`, [FILE]);
  await pool.query(`delete from base_import where file_name = $1`, [FILE]);
  await pool.end();
});

test('admin envia a planilha, confere o de-para, vê a prévia e importa em segundo plano', async ({ page }) => {
  await login(page);
  await page.goto('/admin/importacao');
  await expect(page.getByRole('heading', { name: 'Importação da base atual', level: 1 })).toBeVisible();

  await page.locator('input[type=file]').setInputFiles({ name: FILE, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: await planilha() });
  await page.getByRole('button', { name: 'Enviar e conferir' }).click();
  await page.waitForURL(/\/admin\/importacao\/[0-9a-f-]{36}$/);

  // o Voltar leva à lista de importações
  await expect(page.getByRole('link', { name: /Voltar para Importação da base/ })).toBeVisible();

  // de-para sugerido: a aba de encerrados vem marcada como concluídos
  const encerrados = page.locator('details', { hasText: 'Cível encerrados' });
  await expect(encerrados.locator('input[type=checkbox][name$="_closed"]')).toBeChecked();
  const cível = page.locator('details', { hasText: 'Cível 2026' }).first();
  await expect(cível.locator('select[name$="_col_number"]')).toHaveValue('0');

  // prévia
  const previa = page.getByRole('region', { name: /Prévia/ }).or(page.locator('section[aria-labelledby="h-prev"]'));
  await expect(previa).toContainText('Linhas lidas');
  await expect(previa.locator('dt', { hasText: 'Serão criados' }).locator('xpath=..')).toContainText('3');
  await expect(previa.locator('dt', { hasText: 'Concluídos entre eles' }).locator('xpath=..')).toContainText('1');

  // desmarcar a aba de encerrados e salvar atualiza a prévia
  await encerrados.locator('input[type=checkbox][name$="_use"]').uncheck();
  await page.getByRole('button', { name: 'Salvar mapeamento e atualizar prévia' }).click();
  await expect(page.getByText('Mapeamento salvo.')).toBeVisible();
  await expect(previa.locator('dt', { hasText: 'Serão criados' }).locator('xpath=..')).toContainText('2');

  // volta a incluir e importa
  await page.locator('details', { hasText: 'Cível encerrados' }).locator('summary').click(); // a aba desmarcada fica recolhida
  await page.locator('details', { hasText: 'Cível encerrados' }).locator('input[type=checkbox][name$="_use"]').check();
  await page.getByRole('button', { name: 'Salvar mapeamento e atualizar prévia' }).click();
  await expect(page.getByText('Mapeamento salvo.')).toBeVisible();
  await expect(previa.locator('dt', { hasText: 'Serão criados' }).locator('xpath=..')).toContainText('3');
  await page.getByRole('button', { name: 'Importar 3 processos' }).click();

  // acompanha até concluir (a tela atualiza sozinha)
  await expect(page.getByRole('heading', { name: /Importação concluída/ })).toBeVisible({ timeout: 60_000 });
  const resumo = page.locator('section[aria-labelledby="h-res"]');
  await expect(resumo.locator('dt', { hasText: 'Criados' }).first().locator('xpath=..')).toContainText('3');
  await expect(page.getByRole('link', { name: 'Baixar relatório em Excel' })).toBeVisible();

  const { rows } = await pool.query(`select number, monitoring from "case" where number like $1 order by number`, [`${PFX}%`]);
  expect(rows).toHaveLength(3);
  expect(rows.map((r) => r.monitoring)).toEqual([true, true, false]); // o concluído não é monitorado

  // o relatório baixa como Excel
  const resp = await page.request.get(page.url() + '/relatorio');
  expect(resp.status()).toBe(200);
  expect(resp.headers()['content-type']).toContain('spreadsheetml');

  // aparece nas importações anteriores
  await page.goto('/admin/importacao');
  await expect(page.locator('tr', { hasText: FILE })).toContainText('Concluída');
});
