'use client';

import Link from 'next/link';
import { useRef } from 'react';

export type DayEntry = { id: string; title: string; status: string; kind: 'due' | 'internal'; time?: string | null };

/** "+N mais" do calendário: abre um pop-up com todas as tarefas do dia, sem sair da tela. */
export function MoreDay({ day, label, extra, entries, today, listHref }: {
  day: string; label: string; extra: number; entries: DayEntry[]; today: string; listHref: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="self-start text-xs font-bold text-link hover:underline" onClick={() => ref.current?.showModal()} aria-haspopup="dialog">
        +{extra} mais
      </button>
      <dialog
        ref={ref}
        aria-label={`Tarefas de ${label}`}
        // clicar fora da caixa (no fundo) fecha
        onClick={(e) => { if (e.target === ref.current) ref.current?.close(); }}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-card border border-border bg-surface p-0 text-text shadow-[0_12px_40px_rgba(0,0,0,0.3)] backdrop:bg-black/40"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <h2 className="text-base font-extrabold">Tarefas de {label} <span className="font-semibold text-text-muted">· {entries.length}</span></h2>
          <button type="button" className="btn-ghost px-2.5" onClick={() => ref.current?.close()} aria-label="Fechar">✕</button>
        </div>
        <ul className="flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto p-4">
          {entries.map((e) => {
            const done = e.status === 'done';
            const late = !done && day < today;
            const cls = done ? 'border-border bg-surface-2 text-text-muted line-through' : late ? 'border-danger bg-danger-bg text-danger' : day === today ? 'border-warn bg-warn-bg text-warn' : 'border-primary bg-surface text-text';
            return (
              <li key={`${e.id}-${e.kind}`}>
                <Link href={`/tarefas/${e.id}`} className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm font-bold no-underline hover:no-underline ${e.kind === 'internal' ? 'border-dashed' : ''} ${cls}`}>
                  <span className="min-w-0 truncate">{done ? '✓ ' : ''}{e.time ? `${e.time} ` : ''}{e.title}</span>
                  <span className="shrink-0 text-xs font-semibold">{e.kind === 'internal' ? 'Prazo interno' : 'Prazo limite'}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end border-t border-border px-5 py-3">
          <Link href={listHref} className="text-sm font-bold">Abrir na Grade</Link>
        </div>
      </dialog>
    </>
  );
}
