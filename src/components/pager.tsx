import Link from 'next/link';
import { pageWindow, rangeOf, totalPages } from '@/lib/pagination';

/** Paginação no servidor: "Mostrando a–b de N", Anterior/Próxima e números de página. `href(p)` monta o link da página p. */
export function Pager({ page, size, total, href, label = 'itens' }: { page: number; size: number; total: number; href: (p: number) => string; label?: string }) {
  const pages = totalPages(total, size);
  const { from, to } = rangeOf(page, size, total);
  const btn = 'inline-flex min-h-9 min-w-9 items-center justify-center rounded-control border px-3 text-sm font-bold no-underline';
  return (
    <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm text-soft">
      <span>{total === 0 ? `0 ${label}` : `Mostrando ${from.toLocaleString('pt-BR')} a ${to.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} ${label}`}</span>
      {pages > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {page > 1 ? <Link className={`${btn} border-input-border bg-surface`} href={href(page - 1)} rel="prev">Anterior</Link> : <span className={`${btn} border-transparent opacity-40`} aria-disabled="true">Anterior</span>}
          {pageWindow(page, pages).map((n, i) =>
            n === null ? <span key={`gap${i}`} aria-hidden="true" className="px-1 text-text-muted">…</span>
            : n === page ? <span key={n} aria-current="page" className={`${btn} border-text bg-text text-on-text`}>{n}</span>
            : <Link key={n} className={`${btn} border-input-border bg-surface`} href={href(n)}>{n}</Link>,
          )}
          {page < pages ? <Link className={`${btn} border-input-border bg-surface`} href={href(page + 1)} rel="next">Próxima</Link> : <span className={`${btn} border-transparent opacity-40`} aria-disabled="true">Próxima</span>}
        </div>
      )}
    </nav>
  );
}
