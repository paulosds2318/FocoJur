import ExcelJS from 'exceljs';
import { getSession } from '@/lib/auth/session';
import { parseCaseFilters, searchParamsToRecord } from '@/lib/case-filters';
import { formatCaseNumber } from '@/lib/case-number';
import { PORTFOLIO_LABEL, PROGNOSIS_LABEL } from '@/lib/format';
import { searchCases } from '@/server/cases';
import { getLookups } from '@/server/lookups';

// RF-33: exporta o resultado filtrado, com colunas equivalentes às da planilha atual.
export async function GET(req: Request) {
  const session = await getSession();
  const u = session?.user as (NonNullable<typeof session>['user'] & { mustChangePassword?: boolean; active?: boolean }) | undefined;
  if (!u || u.mustChangePassword || u.active === false) return new Response('Não autorizado', { status: 401 });

  const filters = parseCaseFilters(searchParamsToRecord(new URL(req.url).searchParams));
  const [{ rows }, lk] = await Promise.all([searchCases(filters, { all: true }), getLookups(['subject'], { includeInactive: true })]);
  const subjects = new Map(lk.subject.map((s) => [s.id, s.label]));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Processos');
  ws.columns = [
    { header: 'Processo', key: 'number', width: 28 },
    { header: 'Carteira', key: 'portfolio', width: 14 },
    { header: 'Demandante', key: 'plaintiff', width: 28 },
    { header: 'Objeto', key: 'subject', width: 28 },
    { header: 'UF', key: 'state', width: 6 },
    { header: 'Cidade', key: 'city', width: 20 },
    { header: 'Loja', key: 'store', width: 8 },
    { header: 'Prognóstico', key: 'prognosis', width: 14 },
    { header: 'Valor de risco', key: 'risk', width: 16, style: { numFmt: '"R$" #,##0.00' } },
    { header: 'Responsável', key: 'owner', width: 20 },
    { header: 'Situação', key: 'status', width: 14 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow({
      number: formatCaseNumber(r.number),
      portfolio: PORTFOLIO_LABEL[r.portfolio],
      plaintiff: r.plaintiff ?? '',
      subject: r.subjectId ? subjects.get(r.subjectId) ?? '' : '',
      state: r.state ?? '',
      city: r.city ?? '',
      store: r.costCenter ?? '',
      prognosis: r.prognosis ? PROGNOSIS_LABEL[r.prognosis as keyof typeof PROGNOSIS_LABEL] : '',
      risk: r.riskTotal === null ? null : Number(r.riskTotal),
      owner: r.ownerName ?? '',
      status: r.closedAt ? 'Encerrado' : 'Em andamento',
    });
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="processos-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  });
}
