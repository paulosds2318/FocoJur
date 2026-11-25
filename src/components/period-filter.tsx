import Link from 'next/link';
import { MIN_YEAR, MONTH_NAMES, periodParams, type Period, type PeriodMode } from '@/lib/period';
import { todayInSaoPaulo } from '@/lib/deadlines';

const chip = (on: boolean) =>
  `inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-bold no-underline ${on ? 'border-text bg-text text-on-text hover:text-on-text' : 'border-input-border bg-surface text-soft'}`;

/**
 * Seletor de período (servidor, sem JS): chips de atalho + formulário GET de "Mês e ano" ou "Período personalizado".
 * `keep` carrega os outros filtros da tela (moeda, carteira…) para não se perderem ao trocar o período.
 */
export function PeriodFilter({ basePath, period, modes, keep = {} }: {
  basePath: string; period: Period; modes: readonly { key: PeriodMode; label: string }[]; keep?: Record<string, string>;
}) {
  const cy = Number(todayInSaoPaulo().slice(0, 4));
  const years: number[] = [];
  for (let y = cy + 1; y >= MIN_YEAR; y--) years.push(y);
  const href = (q: Record<string, string>) => `${basePath}?${new URLSearchParams({ ...keep, ...q })}`;
  const linkFor = (k: PeriodMode) => {
    if (k === 'ym') return href({ periodo: 'ym', mes: String(period.month), ano: String(period.year) });
    if (k === 'custom') return href(period.mode === 'custom' ? periodParams(period) : { periodo: 'custom' });
    return href({ periodo: k });
  };
  const active = (k: PeriodMode) => (period.pick ? period.pick === k : period.mode === k);
  const hidden = (q: Record<string, string>) => Object.entries({ ...keep, ...q }).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

  return (
    <div className="flex flex-col gap-2.5">
      <div role="group" aria-label="Período" className="flex flex-wrap gap-2">
        {modes.map((m) => <Link key={m.key} href={linkFor(m.key)} className={chip(active(m.key))} aria-current={active(m.key) ? 'true' : undefined}>{m.label}</Link>)}
      </div>

      {period.pick === 'ym' && (
        <form method="get" action={basePath} className="flex flex-wrap items-end gap-3" aria-label="Mês e ano">
          {hidden({ periodo: 'ym' })}
          <label className="flex flex-col gap-1"><span className="label">Mês</span>
            <select className="input w-40" name="mes" defaultValue={String(period.month)}>{MONTH_NAMES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></label>
          <label className="flex flex-col gap-1"><span className="label">Ano</span>
            <select className="input w-28" name="ano" defaultValue={String(period.year)}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
          <button className="btn-secondary" type="submit">Aplicar</button>
        </form>
      )}

      {period.pick === 'custom' && (
        <form method="get" action={basePath} className="flex flex-wrap items-end gap-3" aria-label="Período personalizado">
          {hidden({ periodo: 'custom' })}
          <label className="flex flex-col gap-1"><span className="label">De</span>
            <input className="input w-44" type="date" name="de" min={`${MIN_YEAR}-01-01`} defaultValue={period.mode === 'custom' ? period.from ?? '' : ''} required /></label>
          <label className="flex flex-col gap-1"><span className="label">Até</span>
            <input className="input w-44" type="date" name="ate" min={`${MIN_YEAR}-01-01`} defaultValue={period.mode === 'custom' ? period.to ?? '' : ''} required /></label>
          <button className="btn-secondary" type="submit">Aplicar</button>
        </form>
      )}

      {period.notice && <p role="status" className="rounded-control bg-warn-bg px-3 py-2 text-sm font-bold text-warn">{period.notice}</p>}
    </div>
  );
}
