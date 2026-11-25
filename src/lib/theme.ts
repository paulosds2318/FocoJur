export const THEME_KEY = 'focojur-theme';
export type Theme = 'auto' | 'light' | 'dark';

/** Executa antes da pintura (no <head>) para a página já nascer no tema escolhido, sem piscar. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem('${THEME_KEY}');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'auto'}catch(e){document.documentElement.dataset.theme='auto'}`;
