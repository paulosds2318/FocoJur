'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { formatCaseNumber } from '@/lib/case-number';
import { moveTaskAction, moveToBucketAction, quickAddTaskAction, setAssigneesAction } from './actions';

export type BoardTask = {
  id: string; title: string; status: string; dueLabel: string; internalLabel: string | null; urgency: 'late' | 'today' | 'soon' | 'normal';
  typeLabel: string | null; caseId: string | null; caseNumber: string | null; portfolioLabel: string | null;
  assignees: { id: string; name: string }[]; reviewerName: string | null; bucketId: string | null;
};
export type BoardGroup = { key: string; label: string };

const STATUS_COLS: BoardGroup[] = [
  { key: 'todo', label: 'A fazer' },
  { key: 'doing', label: 'Em andamento' },
  { key: 'review', label: 'Aguardando revisão' },
  { key: 'done', label: 'Concluídas' },
];
export const NO_BUCKET = 'none';
const URG_CLS = { late: 'b-red', today: 'b-red', soon: 'b-yel', normal: 'b-gray' } as const;

const initials = (name: string | null) => (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');

function Avatar({ name, title }: { name: string | null; title: string }) {
  if (!name) return null;
  return <span title={`${title}: ${name}`} aria-label={`${title}: ${name}`} className="inline-flex size-7 items-center justify-center rounded-full bg-primary text-[11px] font-extrabold text-white">{initials(name)}</span>;
}

/**
 * Quadro no padrão do Planner: colunas por bucket (padrão) ou por situação, "Adicionar tarefa" no topo de cada coluna,
 * círculo para concluir, data, avatares e as concluídas recolhidas por coluna.
 */
export function Board({ tasks, canWrite, owners = [], groupBy, buckets }: {
  tasks: BoardTask[]; canWrite: boolean; owners?: { id: string; label: string }[]; groupBy: 'bucket' | 'status'; buckets: BoardGroup[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  // barra de rolagem horizontal fixa: a nativa fica oculta e uma cópia "grudada" no rodapé da janela rola junto com o quadro
  const scroller = useRef<HTMLDivElement>(null);
  const proxy = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => { setScrollWidth(el.scrollWidth); setOverflowing(el.scrollWidth > el.clientWidth + 1); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  }, []);
  const syncing = useRef(false);
  const sync = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to || syncing.current) { syncing.current = false; return; }
    if (to.scrollLeft !== from.scrollLeft) { syncing.current = true; to.scrollLeft = from.scrollLeft; }
  };
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const byBucket = groupBy === 'bucket';
  const cols: BoardGroup[] = byBucket ? [{ key: NO_BUCKET, label: 'Sem bucket' }, ...buckets] : STATUS_COLS;
  const keyOf = (t: BoardTask) => (byBucket ? (t.bucketId ?? NO_BUCKET) : t.status);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, fallback: string) => {
    setError(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? fallback);
      router.refresh();
    });
  };
  const move = (id: string, to: string) => run(() => moveTaskAction(id, to), 'Não foi possível mover a tarefa.');
  const toBucket = (id: string, key: string) => run(() => moveToBucketAction(id, key === NO_BUCKET ? '' : key), 'Não foi possível mover a tarefa.');
  const toggleAssignee = (t: BoardTask, userId: string) => {
    const ids = t.assignees.map((a) => a.id);
    run(() => setAssigneesAction(t.id, ids.includes(userId) ? ids.filter((x) => x !== userId) : [...ids, userId]), 'Não foi possível trocar os responsáveis.');
  };
  const drop = (id: string, key: string) => (byBucket ? toBucket(id, key) : move(id, key));

  const renderCard = (t: BoardTask) => {
    const done = t.status === 'done';
    return (
      <article
        key={t.id}
        draggable={canWrite}
        onDragStart={(e) => e.dataTransfer.setData('text/plain', t.id)}
        className={`flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 hover:border-primary ${done ? 'opacity-75' : ''}`}
      >
        <div className="flex items-start gap-2.5">
          <button
            type="button" disabled={!canWrite || pending}
            aria-label={done ? `Reabrir tarefa ${t.title}` : `Concluir tarefa ${t.title}`} aria-pressed={done}
            onClick={() => move(t.id, done ? 'todo' : 'done')}
            className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-extrabold leading-none ${done ? 'border-ok bg-ok text-white' : 'border-text-muted bg-surface hover:border-primary'}`}
          >{done ? '✓' : ''}</button>
          <div className="min-w-0 flex-1">
            <div className={`text-sm font-extrabold leading-snug ${done ? 'text-text-muted line-through' : ''}`}>{t.title}</div>
            <div className="mt-0.5 text-xs text-text-muted">
              {t.caseId ? <Link href={`/processos/${t.caseId}`}>{formatCaseNumber(t.caseNumber ?? '')}</Link> : 'Tarefa geral'}
              {t.portfolioLabel ? ` · ${t.portfolioLabel}` : ''}{t.typeLabel ? ` · ${t.typeLabel}` : ''}
            </div>
          </div>
          {canWrite && <Link href={`/tarefas/${t.id}`} className="shrink-0 text-xs font-bold" aria-label={`Editar tarefa ${t.title}`}>Editar</Link>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
          <div className="flex flex-wrap gap-1.5">
            {!done && <span className={`badge ${URG_CLS[t.urgency]}`}>Limite: {t.dueLabel}</span>}
            {t.internalLabel && !done && <span className="badge b-gray">Interno: {t.internalLabel}</span>}
            {done && <span className="badge b-teal">Concluída</span>}
          </div>
          <div className="flex items-center gap-1" aria-label="Pessoas">
            {t.assignees.slice(0, 3).map((a) => <Avatar key={a.id} name={a.name} title="Responsável" />)}
            {t.assignees.length > 3 && <span title={t.assignees.slice(3).map((a) => a.name).join(', ')} className="inline-flex size-7 items-center justify-center rounded-full bg-surface-3 text-[11px] font-extrabold text-soft">+{t.assignees.length - 3}</span>}
            <Avatar name={t.reviewerName} title="Revisor" />
            {t.assignees.length === 0 && <span className="text-xs text-text-muted">sem responsável</span>}
          </div>
        </div>
        {canWrite && (
          <details className="text-xs">
            <summary className="cursor-pointer font-bold text-text-muted">Atribuir e mover</summary>
            <div className="mt-2 flex flex-col gap-2">
              {owners.length > 0 && (
                <fieldset className="flex flex-col gap-1">
                  <legend className="font-bold text-text-muted">Responsáveis (marque uma ou mais pessoas)</legend>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {owners.map((o) => (
                      <label key={o.id} className="flex items-center gap-1.5 font-bold">
                        <input type="checkbox" className="size-4 accent-primary" checked={t.assignees.some((a) => a.id === o.id)} disabled={pending}
                          aria-label={`Responsável pela tarefa ${t.title}: ${o.label}`} onChange={() => toggleAssignee(t, o.id)} />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}
              <label className="flex items-center gap-2 font-bold text-text-muted">Coluna
                <select className="input min-h-8 flex-1 py-0 text-xs" value={t.bucketId ?? NO_BUCKET} aria-label={`Coluna da tarefa ${t.title}`} onChange={(e) => toBucket(t.id, e.target.value)}>
                  <option value={NO_BUCKET}>Sem bucket</option>{buckets.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
                </select></label>
              <label className="flex items-center gap-2 font-bold text-text-muted">Situação
                <select className="input min-h-8 flex-1 py-0 text-xs" value={t.status} aria-label={`Mover tarefa ${t.title}`} onChange={(e) => move(t.id, e.target.value)}>
                  {STATUS_COLS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select></label>
            </div>
          </details>
        )}
      </article>
    );
  };

  return (
    <>
      {error && <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm font-bold text-danger">{error}</p>}
      <div>
      <div ref={scroller} onScroll={() => sync(scroller.current, proxy.current)} className="overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-start gap-4" aria-busy={pending}>
          {cols.map((c) => {
            const mine = tasks.filter((t) => keyOf(t) === c.key);
            // por bucket, as concluídas ficam recolhidas na própria coluna; por situação, a coluna "Concluídas" as mostra
            const open = byBucket ? mine.filter((t) => t.status !== 'done') : mine;
            const closed = byBucket ? mine.filter((t) => t.status === 'done') : [];
            return (
              <section
                key={c.key}
                aria-label={c.label}
                onDragOver={(e) => { if (canWrite) { e.preventDefault(); setOver(c.key); } }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  setOver(null);
                  const id = e.dataTransfer.getData('text/plain');
                  if (canWrite && id) drop(id, c.key);
                }}
                className={`flex max-h-[max(26rem,calc(100vh-15rem))] w-[320px] shrink-0 flex-col gap-2.5 overflow-y-auto overscroll-contain rounded-card p-3 ${over === c.key ? 'bg-surface-3' : 'bg-surface-2'}`}
              >
                <div className="sticky -top-3 z-10 -mx-3 -mt-3 flex flex-col gap-2 bg-inherit px-4 pb-2 pt-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-extrabold">{c.label}</h2>
                    <span className="badge bg-surface text-soft" aria-label={`${open.length} tarefas abertas`}>{open.length}</span>
                  </div>
                  {byBucket && canWrite && (
                    adding === c.key ? (
                      <form
                        className="flex gap-1.5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const title = draft.trim();
                          if (title.length < 3) { setError('Informe o título da tarefa (mínimo 3 letras).'); return; }
                          run(() => quickAddTaskAction(c.key === NO_BUCKET ? '' : c.key, title), 'Não foi possível criar a tarefa.');
                          setDraft(''); setAdding(null);
                        }}
                      >
                        <input className="input min-h-9 flex-1" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Título da tarefa" aria-label={`Título da nova tarefa em ${c.label}`} />
                        <button className="btn min-h-9 px-3" type="submit">Criar</button>
                      </form>
                    ) : (
                      <button type="button" className="flex items-center gap-1.5 text-left text-sm font-bold text-link" onClick={() => { setAdding(c.key); setDraft(''); }}>
                        <span aria-hidden="true" className="text-lg leading-none">+</span> Adicionar tarefa
                      </button>
                    )
                  )}
                </div>
                {open.length === 0 && closed.length === 0 && <p className="px-1 text-xs text-text-muted">Nenhuma tarefa.</p>}
                {open.map((t) => renderCard(t))}
                {closed.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-sm font-bold text-soft">Tarefas concluídas <span className="text-text-muted">· {closed.length}</span></summary>
                    <div className="mt-2 flex flex-col gap-2.5">{closed.map((t) => renderCard(t))}</div>
                  </details>
                )}
              </section>
            );
          })}
        </div>
      </div>
      <div
        ref={proxy} onScroll={() => sync(proxy.current, scroller.current)} aria-hidden="true" data-testid="barra-rolagem-fixa"
        className={`sticky bottom-0 z-20 overflow-x-auto bg-bg py-1 ${overflowing ? '' : 'hidden'}`}
      >
        <div style={{ width: scrollWidth, height: 1 }} />
      </div>
      </div>
    </>
  );
}
