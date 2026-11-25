'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Itens entram aqui conforme cada marco é entregue (ver docs/ROADMAP.md).
const items = [
  { href: '/inicio', label: 'Início' },
  { href: '/caixa-entrada', label: 'Caixa de entrada' },
  { href: '/triagem', label: 'Triagem' },
  { href: '/alertas', label: 'Alertas' },
  { href: '/tarefas', label: 'Tarefas e prazos' },
  { href: '/processos', label: 'Processos' },
  { href: '/paineis', label: 'Painéis' },
  { href: '/conectores', label: 'Conectores' },
];
const adminItems = [
  { href: '/admin/usuarios', label: 'Usuários' },
  { href: '/admin/auditoria', label: 'Auditoria' },
  { href: '/admin/listas', label: 'Listas oficiais' },
  { href: '/admin/importacao', label: 'Importação da base' },
  { href: '/admin/feriados', label: 'Feriados' },
  { href: '/admin/monitoramento', label: 'Monitoramento' },
  { href: '/admin/ia', label: 'Modelos de IA' },
  { href: '/admin/ia/custos', label: 'Custos de IA' },
];

export function NavLinks({ isAdmin, badges = {} }: { isAdmin: boolean; badges?: Record<string, number> }) {
  const path = usePathname();
  const all = isAdmin ? [...items, ...adminItems] : items;
  // o item ativo é o de href mais longo que casa com a rota (evita marcar /admin/ia dentro de /admin/ia/custos)
  const active = all
    .filter((i) => path === i.href || path.startsWith(`${i.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const render = (list: typeof items) =>
    list.map((i) => (
      <Link key={i.href} href={i.href} className="nav-link" aria-current={active === i.href ? 'page' : undefined}>
        {i.label}
        {badges[i.href] ? <span className={`badge ml-auto ${active === i.href ? 'bg-surface text-danger' : 'b-red'}`}>{badges[i.href]}</span> : null}
      </Link>
    ));
  return (
    <>
      {render(items)}
      {isAdmin && (
        <>
          <div className="px-3.5 pb-1.5 pt-4 text-[11px] font-extrabold uppercase tracking-widest text-text-muted">Administração</div>
          {render(adminItems)}
        </>
      )}
    </>
  );
}
