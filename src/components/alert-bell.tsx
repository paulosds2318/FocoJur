'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export type BellItem = { id: string; label: string; text: string; when: string };

/** Sininho do topo: contagem de alertas pendentes e os mais recentes; clicar leva ao alerta (e ao processo, pelo painel). */
export function AlertBell({ total, items }: { total: number; items: BellItem[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div ref={box} className="fixed right-[7.5rem] top-4 z-40">
      <button
        type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="true"
        aria-label={total ? `Alertas: ${total} aguardando decisão` : 'Alertas: nenhum pendente'}
        className="relative inline-flex h-10 w-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface text-text shadow-sm hover:bg-surface-2"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {total > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-primary px-1 text-center text-[11px] font-extrabold leading-5 text-white">{total > 99 ? '99+' : total}</span>}
      </button>
      {open && (
        <div role="region" aria-label="Alertas pendentes" className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-card border border-border bg-surface shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
          <div className="border-b border-border px-4 py-2.5 text-sm font-extrabold">{total === 0 ? 'Nenhum alerta pendente' : `${total} ${total === 1 ? 'alerta aguarda' : 'alertas aguardam'} sua decisão`}</div>
          <ul className="max-h-[22rem] overflow-y-auto">
            {items.map((i) => (
              <li key={i.id} className="border-b border-border last:border-0">
                <Link href={`/alertas?item=${i.id}`} onClick={() => setOpen(false)} className="flex flex-col gap-0.5 px-4 py-2.5 no-underline hover:bg-surface-2 hover:no-underline">
                  <span className="text-sm font-extrabold text-text">{i.label}</span>
                  <span className="text-[13px] leading-snug text-soft">{i.text}</span>
                  <span className="text-xs text-text-muted">{i.when}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="px-4 py-2.5"><Link href="/alertas" onClick={() => setOpen(false)} className="text-sm font-bold">Ver todos os alertas</Link></div>
        </div>
      )}
    </div>
  );
}
