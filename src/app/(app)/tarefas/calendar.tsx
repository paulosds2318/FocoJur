import Link from 'next/link';
import { addDays } from '@/lib/deadlines';
import { MoreDay } from './calendar-more';

export type CalTask = { id: string; title: string; status: string; dueDate: string | null; internalDueDate: string | null; dueTime?: string | null };
type Mode = 'month' | 'week';

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const dow = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const MAX_PER_DAY = 3;

/** Primeiro e último dia exibidos: o mês inteiro (de domingo a sábado) ou a semana que contém `anchor`. */
export function calendarRange(mode: Mode, anchor: string) {
  if (mode === 'week') {
    const start = addDays(anchor, -dow(anchor));
    return { start, end: addDays(start, 6) };
  }
  const first = `${anchor.slice(0, 7)}-01`;
  const start = addDays(first, -dow(first));
  const next = new Date(`${first}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = addDays(next.toISOString().slice(0, 10), -1);
  return { start, end: addDays(last, 6 - dow(last)) };
}

/** Calendário no padrão do Planner: mês ou semana, tarefas no dia do prazo limite (cheio) e do prazo interno (tracejado), "+N mais" e as não agendadas ao lado. */
export function Calendar({ mode, anchor, today, tasks, unscheduled, href }: {
  mode: Mode; anchor: string; today: string; tasks: CalTask[]; unscheduled: CalTask[];
  /** monta o link mantendo os filtros: `cal` muda mês/semana/modo; `list` abre a Grade filtrada por um dia */
  href: (o: { modo?: Mode; ancora?: string; dia?: string }) => string;
}) {
  const { start, end } = calendarRange(mode, anchor);
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);

  const entries = (day: string) => [
    ...tasks.filter((t) => t.dueDate === day).map((t) => ({ t, kind: 'due' as const })),
    ...tasks.filter((t) => t.internalDueDate === day && t.internalDueDate !== t.dueDate).map((t) => ({ t, kind: 'internal' as const })),
  ];

  const shift = (dir: 1 | -1) => {
    if (mode === 'week') return addDays(anchor, 7 * dir);
    const d = new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + dir);
    return d.toISOString().slice(0, 10);
  };
  const [y, m] = anchor.split('-').map(Number);
  const title = mode === 'month' ? `${MONTHS[m - 1]} de ${y}` : `${start.split('-').reverse().slice(0, 2).join('/')} a ${end.split('-').reverse().join('/')}`;
  const btn = 'inline-flex min-h-9 items-center rounded-control border border-input-border bg-surface px-3 text-sm font-bold no-underline';

  const chip = (t: CalTask, kind: 'due' | 'internal', day: string) => {
    const done = t.status === 'done';
    const late = !done && day < today;
    const cls = done ? 'border-border bg-surface-2 text-text-muted line-through'
      : late ? 'border-danger bg-danger-bg text-danger'
      : day === today ? 'border-warn bg-warn-bg text-warn'
      : 'border-primary bg-surface text-text';
    return (
      <Link
        key={`${t.id}-${kind}`} href={`/tarefas/${t.id}`}
        title={`${kind === 'internal' ? 'Prazo interno' : 'Prazo limite'}: ${t.title}`}
        className={`block truncate rounded-md border px-1.5 py-0.5 text-xs font-bold no-underline hover:no-underline ${kind === 'internal' ? 'border-dashed' : ''} ${cls}`}
      >
        {done ? '✓ ' : kind === 'internal' ? 'Int. ' : ''}{kind === 'due' && t.dueTime ? `${t.dueTime.slice(0, 5)} ` : ''}{t.title}
      </Link>
    );
  };

  return (
    <div className="flex flex-wrap items-start gap-5">
      <section className="card min-w-0 flex-[3_1_620px] p-3" aria-label="Calendário de tarefas">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link className={btn} href={href({ ancora: today })}>Hoje</Link>
          <Link className={btn} href={href({ ancora: shift(-1) })} aria-label={mode === 'month' ? 'Mês anterior' : 'Semana anterior'}>‹</Link>
          <Link className={btn} href={href({ ancora: shift(1) })} aria-label={mode === 'month' ? 'Próximo mês' : 'Próxima semana'}>›</Link>
          <h2 className="mx-1 text-base font-extrabold first-letter:uppercase">{title}</h2>
          <div className="ml-auto flex gap-1" role="group" aria-label="Período">
            {(['week', 'month'] as const).map((k) => (
              <Link key={k} href={href({ modo: k })} aria-current={mode === k ? 'true' : undefined} className={`${btn} ${mode === k ? 'border-text bg-text text-on-text hover:text-on-text' : ''}`}>{k === 'week' ? 'Semana' : 'Mês'}</Link>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[640px] grid-cols-7 gap-px rounded-control bg-border">
            {WEEKDAYS.map((w) => <div key={w} className="bg-surface-2 px-2 py-1.5 text-center text-xs font-extrabold text-soft">{w}</div>)}
            {days.map((day) => {
              const list = entries(day);
              const shown = mode === 'week' ? list : list.slice(0, MAX_PER_DAY);
              const outside = mode === 'month' && day.slice(0, 7) !== anchor.slice(0, 7);
              return (
                <div key={day} className={`flex flex-col gap-1 bg-surface p-1.5 ${mode === 'week' ? 'min-h-56' : 'min-h-28'} ${outside ? 'bg-surface-2' : ''}`} data-day={day}>
                  <Link href={href({ dia: day })} className={`self-start rounded-full px-1.5 text-xs font-extrabold no-underline hover:no-underline ${day === today ? 'bg-primary text-white hover:text-white' : outside ? 'text-text-muted' : 'text-soft'}`} aria-label={`Tarefas do dia ${day.split('-').reverse().join('/')}`}>
                    {Number(day.slice(8))}{day.slice(8) === '01' ? ` ${MONTHS[Number(day.slice(5, 7)) - 1].slice(0, 3)}` : ''}
                  </Link>
                  {shown.map((e) => chip(e.t, e.kind, day))}
                  {list.length > shown.length && (
                    <MoreDay
                      day={day} today={today} label={day.split('-').reverse().join('/')} extra={list.length - shown.length} listHref={href({ dia: day })}
                      entries={list.map((e) => ({ id: e.t.id, title: e.t.title, status: e.t.status, kind: e.kind, time: e.kind === 'due' ? e.t.dueTime?.slice(0, 5) ?? null : null }))}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <p className="mt-2 text-xs text-text-muted">Contorno cheio = prazo limite; tracejado “Int.” = prazo interno. Vermelho = atrasada; amarelo = vence hoje. Clique em “+N mais” para ver todas as tarefas do dia, ou no número do dia para abrir a Grade daquele dia.</p>
      </section>

      <aside className="card flex min-w-0 flex-[1_1_260px] flex-col gap-2 p-4" aria-label="Tarefas não agendadas">
        <h2 className="text-base font-extrabold">Tarefas não agendadas <span className="font-semibold text-text-muted">· {unscheduled.length}</span></h2>
        <p className="text-xs text-text-muted">Abertas e sem prazo limite. Abra a tarefa para definir a data.</p>
        {unscheduled.length === 0 && <p className="text-sm text-text-muted">Nenhuma.</p>}
        <ul className="flex max-h-[28rem] flex-col gap-1.5 overflow-y-auto">
          {unscheduled.map((t) => <li key={t.id}><Link href={`/tarefas/${t.id}`} className="block rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm font-bold no-underline hover:border-primary hover:no-underline">{t.title}</Link></li>)}
        </ul>
      </aside>
    </div>
  );
}
