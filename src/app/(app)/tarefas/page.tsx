import Link from 'next/link';
import { db } from '@/db';
import { cases } from '@/db/schema/case';
import { desc, isNull } from 'drizzle-orm';
import { requireUser } from '@/lib/auth/session';
import { formatCaseNumber } from '@/lib/case-number';
import { todayInSaoPaulo, urgency } from '@/lib/deadlines';
import { dateBr, PORTFOLIO_LABEL } from '@/lib/format';
import { getLookups } from '@/server/lookups';
import { getPendingMovement } from '@/server/movements';
import { getHolidaySet, listTasks, NO_OWNER, type TaskView } from '@/server/tasks';
import { listUsers } from '@/server/users';
import { Board, type BoardTask } from './board';
import { Calendar, calendarRange } from './calendar';
import { TaskBox } from '../triagem/suggestion';
import { TaskForm } from './task-form';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

const VIEWS: [TaskView, string][] = [['all', 'Todas'], ['mine', 'Minhas'], ['general', 'Tarefas gerais']];

export default async function TarefasPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const view = (VIEWS.some(([k]) => k === one(sp.view)) ? one(sp.view) : 'all') as TaskView;
  const layout = one(sp.layout) === 'list' ? 'list' : one(sp.layout) === 'calendar' ? 'calendar' : 'board';
  const groupBy = one(sp.agrupar) === 'status' ? 'status' : 'bucket';
  const today = todayInSaoPaulo();
  const mode = one(sp.modo) === 'week' ? 'week' : 'month';
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.ancora)) ? one(sp.ancora) : today;

  const [holidays, users, lk, caseRows] = await Promise.all([
    getHolidaySet(),
    listUsers(),
    getLookups(['task_type', 'task_bucket'], { includeInactive: true }),
    db.select({ id: cases.id, number: cases.number }).from(cases).where(isNull(cases.deletedAt)).orderBy(desc(cases.createdAt)).limit(200),
  ]);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(one(sp.dia)) ? one(sp.dia) : '';
  const alert = one(sp.andamento) ? await getPendingMovement(one(sp.andamento)) : null;
  const filters = { view, portfolio: one(sp.portfolio), typeId: one(sp.typeId), userId: session.user.id, ownerId: one(sp.resp), bucketId: one(sp.col) };
  const range = calendarRange(mode, anchor);
  const rows = await listTasks(layout === 'calendar' ? { ...filters, from: range.start, to: range.end, doneDays: 'all' } : { ...filters, day });
  const unscheduledRows = layout === 'calendar' ? (await listTasks({ ...filters })).filter((t) => !t.dueDate && t.status !== 'done') : [];
  const canWrite = session.user.role !== 'viewer';

  const tasks: BoardTask[] = rows.map((t) => {
    const u = urgency(t.dueDate, today, holidays);
    return {
      id: t.id, title: t.title, status: t.status, urgency: u, assignees: t.assignees, bucketId: t.bucketId, typeLabel: t.typeLabel, caseId: t.caseId, caseNumber: t.caseNumber,
      portfolioLabel: t.portfolio ? PORTFOLIO_LABEL[t.portfolio] : null, reviewerName: t.reviewerName,
      internalLabel: t.internalDueDate ? dateBr(t.internalDueDate) : null,
      dueLabel: !t.dueDate ? 'Sem prazo' : u === 'late' ? `Atrasado (${dateBr(t.dueDate)})` : u === 'today' ? 'Hoje' : dateBr(t.dueDate),
    };
  });

  const link = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ view, layout, agrupar: groupBy === 'status' ? 'status' : '', portfolio: one(sp.portfolio), typeId: one(sp.typeId), resp: one(sp.resp), col: one(sp.col), dia: day, modo: layout === 'calendar' ? mode : '', ancora: one(sp.ancora), ...over })) if (v) p.set(k, v);
    return `/tarefas?${p}`;
  };
  const bucketOpts = lk.task_bucket.filter((b) => b.active).map((b) => ({ id: b.id, label: b.label }));
  const bucketGroups = lk.task_bucket.filter((b) => b.active || rows.some((t) => t.bucketId === b.id)).map((b) => ({ key: b.id, label: b.label }));
  const bucketName = new Map(lk.task_bucket.map((b) => [b.id, b.label]));
  const toCal = (t: (typeof rows)[number]) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate, internalDueDate: t.internalDueDate, dueTime: t.dueTime });
  const owners = users.filter((u) => u.role !== 'viewer' && u.active !== false).map((u) => ({ id: u.id, label: u.name }));

  return (
    <>
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-extrabold">Tarefas e prazos</h1>
        <p className="text-[15px] text-text-muted">Substitui o Planner. Toda tarefa pertence a um processo, exceto as tarefas gerais.</p>
      </header>

      {canWrite && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-extrabold">Nova tarefa</summary>
          <TaskForm types={lk.task_type.filter((t) => t.active).map((t) => ({ id: t.id, label: t.label }))} buckets={bucketOpts} owners={owners} caseOptions={caseRows.map((c) => ({ id: c.id, label: formatCaseNumber(c.number) }))} />
        </details>
      )}

      {/^\d{4}-\d{2}-\d{2}$/.test(one(sp.criada)) && <p role="status" className="rounded-control bg-ok-bg px-3.5 py-2.5 text-sm font-bold text-ok">Tarefa criada com prazo limite em {dateBr(one(sp.criada))}. O alerta de andamento ficou como lido.</p>}
      {alert && canWrite && (
        <section className="card flex flex-col gap-3 border-l-4 border-l-primary p-5" aria-labelledby="h-alerta">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="h-alerta" className="text-[17px] font-extrabold">Criar tarefa a partir do alerta</h2>
          </div>
          <p className="text-sm text-text-muted">Processo <Link className="font-bold" href={`/processos/${alert.caseId}`}>{formatCaseNumber(alert.caseNumber)}</Link> · publicado em {dateBr(alert.occurredAt.toISOString().slice(0, 10))}. Ao criar a tarefa, o alerta fica como lido e sai da fila de Alertas.</p>
          <div className="flex flex-wrap gap-3.5">
            <div className="flex min-w-[260px] flex-1 flex-col gap-1"><div className="text-xs font-extrabold text-ai">Resumo da IA</div><div className="text-sm leading-normal">{alert.aiSummary ?? <span className="text-text-muted">Sem resumo.</span>}</div></div>
            <div className="flex min-w-[260px] flex-1 flex-col gap-1"><div className="text-xs font-extrabold text-text-muted">Texto original</div><div className="max-h-40 overflow-auto rounded-control bg-bg px-3 py-2.5 text-[13px] leading-normal text-soft">{alert.rawText}</div></div>
          </div>
          <TaskBox alwaysOpen movementId={alert.id} defaultTitle={alert.sugAct ?? alert.title ?? ''} types={lk.task_type.filter((t) => t.active).map((t) => ({ id: t.id, label: t.label, description: t.description }))} owners={owners} />
        </section>
      )}
      {one(sp.andamento) && !alert && <p className="card p-4 text-sm text-text-muted">Este alerta já foi tratado ou não tem processo vinculado. <Link className="font-bold" href="/alertas">Ver alertas pendentes</Link>.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Visão" className="flex flex-wrap gap-2">
          {VIEWS.map(([k, l]) => (
            <Link key={k} href={link({ view: k })} aria-current={view === k ? 'true' : undefined}
              className={`inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-bold no-underline ${view === k ? 'border-text bg-text text-on-text hover:text-on-text' : 'border-input-border bg-surface text-soft'}`}>{l}</Link>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <form method="get" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="layout" value={layout} />
            {groupBy === 'status' && <input type="hidden" name="agrupar" value="status" />}
            {layout === 'calendar' && <><input type="hidden" name="modo" value={mode} /><input type="hidden" name="ancora" value={anchor} /></>}
            <label className="flex items-center gap-1.5 text-[13px] font-bold text-text-muted">Carteira
              <select className="input w-auto" name="portfolio" defaultValue={one(sp.portfolio)}><option value="">Todas</option><option value="civil">Cível</option><option value="labor">Trabalhista</option><option value="procon">Procon</option></select></label>
            <label className="flex items-center gap-1.5 text-[13px] font-bold text-text-muted">Responsável
              <select className="input w-auto" name="resp" defaultValue={one(sp.resp)}><option value="">Todos</option><option value={NO_OWNER}>Sem responsável</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
            <label className="flex items-center gap-1.5 text-[13px] font-bold text-text-muted">Coluna
              <select className="input w-auto" name="col" defaultValue={one(sp.col)}><option value="">Todas</option><option value={NO_OWNER}>Sem bucket</option>{bucketOpts.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
            {layout !== 'calendar' && (
              <label className="flex items-center gap-1.5 text-[13px] font-bold text-text-muted">Dia
                <input className="input w-auto" type="date" name="dia" defaultValue={day} aria-label="Dia do prazo" /></label>
            )}
            <label className="flex items-center gap-1.5 text-[13px] font-bold text-text-muted">Tipo
              <select className="input w-auto" name="typeId" defaultValue={one(sp.typeId)}><option value="">Todos</option>{lk.task_type.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
            <button className="btn-secondary" type="submit">Filtrar</button>
            {(one(sp.resp) || day || one(sp.portfolio) || one(sp.typeId) || one(sp.col)) && <Link className="text-sm font-bold" href={`/tarefas?view=${view}&layout=${layout}`}>Limpar filtros</Link>}
          </form>
          <div role="group" aria-label="Forma de exibição" className="flex gap-1">
            {([['board', 'Quadro'], ['list', 'Grade'], ['calendar', 'Calendário']] as const).map(([k, l]) => (
              <Link key={k} href={link({ layout: k, dia: k === 'calendar' ? '' : day })} aria-current={layout === k ? 'true' : undefined}
                className={`inline-flex min-h-9 items-center rounded-control border px-3 text-sm font-bold no-underline ${layout === k ? 'border-primary bg-primary text-white hover:text-white' : 'border-input-border bg-surface text-soft'}`}>{l}</Link>
            ))}
          </div>
          {layout === 'board' && (
            <div role="group" aria-label="Agrupar por" className="flex items-center gap-1 text-[13px] font-bold text-text-muted">
              Agrupar por:
              {([['bucket', 'Coluna'], ['status', 'Situação']] as const).map(([k, l]) => (
                <Link key={k} href={link({ agrupar: k === 'status' ? 'status' : '' })} aria-current={groupBy === k ? 'true' : undefined}
                  className={`inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-bold no-underline ${groupBy === k ? 'border-text bg-text text-on-text hover:text-on-text' : 'border-input-border bg-surface text-soft'}`}>{l}</Link>
              ))}
            </div>
          )}
        </div>
      </div>


      {layout === 'board' ? (
        <Board tasks={tasks} canWrite={canWrite} owners={owners} groupBy={groupBy} buckets={bucketGroups} />
      ) : layout === 'calendar' ? (
        <Calendar
          mode={mode} anchor={anchor} today={today} tasks={rows.map(toCal)} unscheduled={unscheduledRows.map(toCal)}
          href={(o) => (o.dia ? link({ layout: 'list', dia: o.dia, modo: '', ancora: '' }) : link({ layout: 'calendar', modo: o.modo ?? mode, ancora: o.ancora ?? anchor, dia: '' }))}
        />
      ) : (
        <section className="card pt-2" aria-label="Lista de tarefas">
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Tarefa</th><th>Coluna</th><th>Tipo</th><th>Processo</th><th>Prazo limite</th><th>Prazo interno</th><th>Responsáveis</th><th>Revisor</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {tasks.length === 0 && <tr><td colSpan={10} className="text-text-muted">Nenhuma tarefa.</td></tr>}
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td className="font-bold">{t.title}</td>
                    <td>{bucketName.get(t.bucketId ?? '') ?? 'Sem bucket'}</td>
                    <td>{t.typeLabel ?? 'Geral'}</td>
                    <td>{t.caseId ? <Link href={`/processos/${t.caseId}`}>{formatCaseNumber(t.caseNumber ?? '')}</Link> : 'Tarefa geral'}</td>
                    <td><span className={`badge ${t.urgency === 'late' || t.urgency === 'today' ? 'b-red' : t.urgency === 'soon' ? 'b-yel' : 'b-gray'}`}>{t.dueLabel}</span></td>
                    <td>{t.internalLabel ?? '—'}</td>
                    <td>{t.assignees.length ? t.assignees.map((a) => a.name).join(', ') : '—'}</td>
                    <td>{t.reviewerName ?? '—'}</td>
                    <td>{{ todo: 'A fazer', doing: 'Em andamento', review: 'Aguardando revisão', done: 'Concluída' }[t.status] ?? t.status}</td>
                    <td className="text-right">{canWrite && <Link className="font-bold" href={`/tarefas/${t.id}`}>Editar</Link>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
