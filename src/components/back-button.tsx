'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { createContext, Suspense, useContext, useEffect, useState } from 'react';

type Back = { href: string; label: string } | null;
const Ctx = createContext<(b: Back) => void>(() => undefined);

/** Destino padrão de telas com pai dinâmico (ex.: a tarefa volta à ficha do seu processo); a tela de origem, se houver, tem prioridade. */
export function BackTo({ href, label }: { href: string; label: string }) {
  const set = useContext(Ctx);
  useEffect(() => { set({ href, label }); return () => set(null); }, [set, href, label]);
  return null;
}

/** Tela "pai" de cada rota: o Voltar leva sempre para ela, não para a página anterior do navegador. */
function parentOf(path: string, search: URLSearchParams): Back {
  if (path === '/inicio' || path === '/') return null;
  if (path === '/processos/novo' || /^\/processos\/[^/]+$/.test(path)) return { href: '/processos', label: 'Processos' };
  if (/^\/tarefas\/[^/]+$/.test(path)) return { href: '/tarefas', label: 'Tarefas e prazos' };
  if (/^\/admin\/importacao\/[^/]+$/.test(path)) return { href: '/admin/importacao', label: 'Importação da base' };
  if (path === '/tarefas' && search.get('andamento')) return { href: '/alertas', label: 'Alertas' };
  return { href: '/inicio', label: 'Início' };
}

/** Telas de onde se chega à ficha do processo e para onde ela devolve (com os filtros que estavam na tela). */
const ORIGINS: Record<string, string> = {
  '/tarefas': 'Tarefas e prazos', '/alertas': 'Alertas', '/triagem': 'Triagem', '/inicio': 'Início',
  '/caixa-entrada': 'Caixa de entrada', '/paineis': 'Painéis', '/processos': 'Processos',
};

const FICHA = /^\/processos\/[^/]+$/;
const TAREFA = /^\/tarefas\/[^/]+$/;

const trail: { cur: string | null; lastList: string | null; lastAny: string | null } = { cur: null, lastList: null, lastAny: null };

function Button({ override }: { override: Back }) {
  const path = usePathname();
  const search = useSearchParams();
  // lembra de onde a pessoa veio: `lastList` = última tela de lista/menu; `lastAny` = idem ou ficha do processo.
  // Telas intermediárias (ex.: editar tarefa) não apagam a origem.
  const query = search.toString();
  const url = query ? `${path}?${query}` : path;
  // o histórico de telas vive no módulo (não no componente): o Suspense dos parâmetros da URL pode remontar o botão
  // durante a navegação, e o que está em useRef se perderia. No servidor não se guarda nada (seria compartilhado entre pessoas).
  const track = trail;
  if (typeof window !== 'undefined') {
    if (track.cur === null) track.cur = url;
    if (url !== track.cur) {
      const left = track.cur.split('?')[0];
      if (left !== path && ORIGINS[left]) { track.lastList = track.cur; track.lastAny = track.cur; }
      else if (left !== path && FICHA.test(left)) track.lastAny = track.cur;
      track.cur = url;
    }
  }
  let back = parentOf(path, search);
  // onde faz sentido, o Voltar devolve à tela de origem (com os filtros que estavam nela)
  const origin = FICHA.test(path) ? track.lastList : TAREFA.test(path) ? track.lastAny : null;
  if (origin) {
    const from = origin.split('?')[0];
    back = { href: origin, label: ORIGINS[from] ?? 'a ficha do processo' };
  } else if (override) back = override;
  if (!back) return null;
  return (
    <Link href={back.href} className="btn-ghost -mb-2 self-start px-2.5 no-underline">
      <span aria-hidden="true">←</span>&nbsp;Voltar para {back.label}
    </Link>
  );
}

/** Botão "Voltar" de todas as telas (menos o Início), sempre para a tela pai. */
export function BackProvider({ children }: { children: React.ReactNode }) {
  const [override, setOverride] = useState<Back>(null);
  return (
    <Ctx.Provider value={setOverride}>
      <Suspense fallback={null}><Button override={override} /></Suspense>
      {children}
    </Ctx.Provider>
  );
}
