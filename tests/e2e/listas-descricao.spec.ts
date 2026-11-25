import 'dotenv/config';
import { expect, test, type Page } from '@playwright/test';
import { Pool } from 'pg';

// Descrição das listas oficiais: o admin escreve e ela aparece como dica na Triagem (Objeto) e em Alertas (Tipo de tarefa).
const ADMIN = { email: 'admin@focojur.local', password: 'AdminSenha2026' };
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const TS = Date.now();
const OBJ = `E2E-DESC Objeto ${TS}`;
const TIPO = `E2E-DESC Tipo ${TS}`;
const DESC_OBJ = 'Use quando o cliente nao retirou o veiculo reservado.';
const DESC_TIPO = 'Contestacao: 15 dias uteis a partir da citacao.';
const DIGITOS = `9995${String(TS).slice(-3)}`.padEnd(7, '0');
const NUMERO = `${DIGITOS}-00.2026.8.21.0003`;
const NUM_DIGITS = NUMERO.replace(/\D/g, '');

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('input[name=email]', ADMIN.email);
  await page.fill('input[name=password]', ADMIN.password);
  await page.click('button[type=submit]');
  await page.waitForURL(/inicio/);
}

test.afterAll(async () => {
  const { rows } = await pool.query(`select id from lookup where label like 'E2E-DESC %'`);
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await pool.query(`delete from audit_log where entity_id = any($1::text[])`, [ids.map(String)]).catch(() => undefined);
    await pool.query(`delete from lookup where id = any($1::uuid[])`, [ids]);
  }
  await pool.query(`delete from inbox_item where case_number = $1`, [NUM_DIGITS]);
  await pool.query(`delete from movement where external_id like $1`, [`E2E-DESC-${TS}%`]);
  await pool.query(`delete from "case" where number = $1`, [`9994${String(TS).slice(-9)}`.padEnd(20, '0').slice(0, 20)]);
  await pool.end();
});

test('admin escreve a descrição e ela aparece na Triagem (Objeto) e em Alertas (Tipo de tarefa)', async ({ page }) => {
  await login(page);

  // admin cria o item de Objeto e depois edita a descrição
  await page.goto('/admin/listas?tipo=subject');
  await page.getByLabel('Novo item', { exact: true }).fill(OBJ);
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.getByText('Item adicionado.')).toBeVisible();
  const linha = page.locator('tr', { hasText: OBJ });
  await expect(linha.getByText('Sem descrição')).toBeVisible();
  await linha.getByText('Adicionar descrição').click();
  await linha.getByLabel(`Descrição de ${OBJ}`).fill(DESC_OBJ);
  await linha.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Descrição salva.')).toBeVisible();
  await page.reload();
  await expect(page.locator('tr', { hasText: OBJ })).toContainText(DESC_OBJ);

  // Triagem: o item novo mostra a descrição sob o select de Objeto
  await page.goto('/triagem');
  await page.locator('summary:has-text("Cadastrar pelo número")').click();
  await page.fill('input[name=number]', NUMERO);
  await page.click('button:has-text("Adicionar")');
  await expect(page.getByText('Item criado na caixa de entrada.')).toBeVisible();
  await page.goto('/triagem');
  await page.getByRole('link', { name: NUMERO }).first().click();
  await expect(page.getByTestId('hint-subjectId')).toHaveCount(0); // sem objeto escolhido, sem dica
  await page.selectOption('select[name=subjectId]', { label: OBJ });
  await expect(page.getByTestId('hint-subjectId')).toHaveText(DESC_OBJ);

  // Alertas: o tipo de tarefa mostra a dica da descrição
  await pool.query(`insert into lookup (type, code, label, description) values ('task_type', $1, $2, $3)`, [`e2e_desc_${TS}`, TIPO, DESC_TIPO]);
  const num = `9994${String(TS).slice(-9)}`.padEnd(20, '0').slice(0, 20);
  const { rows: [c] } = await pool.query(`insert into "case" (number, portfolio) values ($1, 'civil') returning id`, [num]);
  await pool.query(
    `insert into movement (case_id, source, external_id, occurred_at, title, raw_text, triage_status) values ($1, 'djen', $2, now(), 'Intimação', $3, 'pending')`,
    [c.id, `E2E-DESC-${TS}`, `E2E-DESC texto ${TS}`],
  );
  await page.goto('/alertas');
  await page.locator('section[aria-label="Lista de alertas"] li', { hasText: `E2E-DESC texto ${TS}` }).getByRole('link').click();
  const card = page.getByRole('complementary', { name: 'Detalhe do alerta' });
  await card.locator('select[name=typeId]').selectOption({ label: TIPO });
  await expect(card.getByTestId('hint-typeId')).toHaveText(`Dica do tipo: ${DESC_TIPO}`);
});
