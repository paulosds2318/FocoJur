'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Menu recolhido no celular: sem isto o menu lateral ocupa a primeira tela inteira e empurra o conteúdo para baixo.
 * Em telas largas o menu fica sempre aberto; fecha sozinho ao trocar de tela.
 */
export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  return (
    <>
      <button
        type="button" className="btn-secondary mx-1 mb-2 md:hidden" aria-expanded={open} aria-controls="menu-lista" onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">{open ? '✕' : '☰'}</span>&nbsp;{open ? 'Fechar menu' : 'Menu'}
      </button>
      <div id="menu-lista" className={`min-h-0 flex-1 flex-col md:flex ${open ? 'flex' : 'hidden'}`}>{children}</div>
    </>
  );
}
