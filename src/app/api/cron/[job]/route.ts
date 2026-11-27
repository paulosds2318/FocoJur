import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';

// Na Vercel não existe o worker (pg-boss): cada rotina agendada é uma chamada de cron a esta rota (vercel.json).
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const JOBS: Record<string, () => Promise<unknown>> = {
  digest: async () => `${await (await import('@/server/digest')).sendDailyDeadlineDigest()} e-mail(s)`,
  ptax: async () => `PTAX ${await (await import('@/lib/fx/ptax')).syncPtax()}`,
  'model-catalog': async () => `${await (await import('@/server/ai-admin')).syncModelCatalog()} modelos`,
  'budget-check': async () => (await import('@/server/ai-admin')).checkBudgetAlerts(),
  datajud: () => connector('datajud'),
  domicilio: () => connector('domicilio'),
  projuris: () => connector('projuris'),
  djen: async () => {
    if ((process.env.DJEN_ENABLED ?? 'true') === 'false') return 'DJEN pausado (DJEN_ENABLED=false)';
    // o cron chama de hora em hora; o intervalo escolhido pelo admin (1, 6, 12 ou 24 h) decide se esta hora roda
    const { getDjenIntervalHours } = await import('@/server/settings');
    const hours = await getDjenIntervalHours();
    const hora = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(new Date()));
    const roda = hours === 1 || (hours === 6 && hora % 6 === 0) || (hours === 12 && (hora === 6 || hora === 18)) || (hours === 24 && hora === 6);
    return roda ? connector('djen') : `fora do horário do intervalo de ${hours} h`;
  },
};

async function connector(k: 'djen' | 'datajud' | 'domicilio' | 'projuris') {
  const { CONNECTORS, runConnector } = await import('@/lib/connectors/runner');
  return JSON.stringify(await runConnector(CONNECTORS[k]));
}

function autorizado(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const a = Buffer.from(req.headers.get('authorization') ?? '');
  const b = Buffer.from(`Bearer ${segredo}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request, ctx: { params: Promise<{ job: string }> }) {
  if (!autorizado(req)) return NextResponse.json({ error: 'não autorizado' }, { status: 401 });
  const { job } = await ctx.params;
  const run = JOBS[job];
  if (!run) return NextResponse.json({ error: 'rotina desconhecida' }, { status: 404 });
  try {
    const out = await run();
    console.log(`[cron:${job}]`, out ?? 'ok');
    return NextResponse.json({ job, ok: true, out: out ?? null });
  } catch (e) {
    console.error(`[cron:${job}]`, e);
    return NextResponse.json({ job, ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
