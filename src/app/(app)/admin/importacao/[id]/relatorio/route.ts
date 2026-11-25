import { getSession } from '@/lib/auth/session';
import { getBatch, reportWorkbook } from '@/server/base-import';

/** Relatório de exceções da importação, em Excel. Só admin. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const u = session?.user as (NonNullable<typeof session>['user'] & { mustChangePassword?: boolean }) | undefined;
  if (!u || u.role !== 'admin' || u.mustChangePassword) return new Response('Não autorizado', { status: 403 });
  const { id } = await ctx.params;
  const batch = await getBatch(id);
  if (!batch || batch.status !== 'done') return new Response('Relatório indisponível.', { status: 404 });
  let buf: Buffer;
  try {
    const wb = await reportWorkbook(batch);
    buf = Buffer.from(await wb.xlsx.writeBuffer());
  } catch (e) {
    console.error('[importacao] relatório', e);
    return new Response('Não foi possível gerar o relatório.', { status: 500 });
  }
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="relatorio-importacao-${id.slice(0, 8)}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
