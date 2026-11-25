import { chromium } from '@playwright/test';
import { isBusinessHours, MIN_INTERVAL_MS, ROBOT_USER_AGENT, throttle, adapterFor } from '../src/lib/portals';
import { storage } from '../src/lib/storage';
import { processPortalFetch } from '../src/server/portal';

/**
 * Consumidor da fila `portal-fetch` (um processo à parte do Next.js; na AWS, container próprio com Chromium).
 * Regras obrigatórias: só consulta pública, sem certificado; 1 req / 5 s por portal; só em horário comercial;
 * user-agent identificado; captcha jamais é contornado (o adaptador devolve 'captcha' e o item segue para preenchimento manual).
 */
export async function runPortalFetch(fetchId: string, caseNumber: string) {
  if (!isBusinessHours()) throw new Error('Fora do horário comercial: a busca será tentada de novo.'); // pg-boss reagenda
  const adapter = adapterFor(caseNumber);
  if (!adapter) throw new Error('Nenhum adaptador liberado para este tribunal.');
  await throttle(adapter.portal);
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: ROBOT_USER_AGENT });
    const page = await ctx.newPage();
    return await processPortalFetch(fetchId, {
      adapter, page, saveFile: (key, data) => storage().put(key, data),
    });
  } finally {
    await browser.close();
  }
}

export const PORTAL_QUEUE = 'portal-fetch';
export { MIN_INTERVAL_MS };
