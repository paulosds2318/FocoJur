'use client';

import { THEME_KEY, type Theme } from '@/lib/theme';

/** Tema que está valendo agora (inclui o "automático", que segue o sistema). */
function effective(): 'light' | 'dark' {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark' || t === 'light') return t;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(THEME_KEY, t); } catch { /* navegação privada: vale só nesta sessão */ }
}

/** Botão fixo no canto superior direito: cada clique alterna entre o tema claro e o escuro. */
export function ThemeToggle() {
  return (
    <div className="fixed right-4 top-4 z-40">
      <button
        type="button"
        onClick={() => apply(effective() === 'dark' ? 'light' : 'dark')}
        title="Alternar entre tema claro e escuro"
        className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-extrabold text-text shadow-sm hover:bg-surface-2"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
        </svg>
        Tema
      </button>
    </div>
  );
}
