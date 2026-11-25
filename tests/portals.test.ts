import { describe, expect, it } from 'vitest';
import { adapterFor, htmlToText, isBusinessHours, MIN_INTERVAL_MS, throttle, type PortalAdapter } from '@/lib/portals';

const adapter = (portal: string, prefix: string): PortalAdapter => ({
  portal, matches: (n) => n.slice(13, 16) === prefix, open: async () => 'ok', pageText: async () => '',
});

describe('robô de portais', () => {
  it('só usa adaptadores liberados explicitamente', () => {
    const eproc = adapter('eproc-tjrs', '821');
    expect(adapterFor('5011870-02.2026.8.21.0001', new Set(), [eproc])).toBeNull(); // existe mas não está liberado
    expect(adapterFor('5011870-02.2026.8.21.0001', new Set(['eproc-tjrs']), [eproc])?.portal).toBe('eproc-tjrs');
    expect(adapterFor('5011870-02.2026.8.19.0001', new Set(['eproc-tjrs']), [eproc])).toBeNull(); // outro tribunal
  });

  it('converte HTML em texto limpo', () => {
    const t = htmlToText('<style>x{}</style><div>Autor: <b>Renata</b></div><script>alert(1)</script><p>Valor&nbsp;R$ 100</p>');
    expect(t).toBe('Autor: Renata\nValor R$ 100');
  });

  it('respeita horário comercial (seg a sex, 8h às 18h de Brasília)', () => {
    expect(isBusinessHours(new Date('2026-11-16T15:00:00Z'))).toBe(true); // segunda 12h
    expect(isBusinessHours(new Date('2026-11-16T09:00:00Z'))).toBe(false); // segunda 6h
    expect(isBusinessHours(new Date('2026-11-14T15:00:00Z'))).toBe(false); // sábado
    expect(isBusinessHours(new Date('2026-11-16T22:00:00Z'))).toBe(false); // segunda 19h
  });

  it('aplica 1 requisição a cada 5 s por portal', async () => {
    let t = 1_000_000;
    const waits: number[] = [];
    const sleep = async (ms: number) => { waits.push(ms); t += ms; };
    await throttle('portal-x', () => t, sleep); // primeira: sem espera
    t += 1000;
    await throttle('portal-x', () => t, sleep); // 1 s depois: espera o resto
    expect(waits).toEqual([MIN_INTERVAL_MS - 1000]);
    await throttle('portal-y', () => t, sleep); // outro portal não espera
    expect(waits).toHaveLength(1);
  });
});

describe('entidades HTML do diário', () => {
  it('decodifica acentos, cedilha, ordinais e numéricas sem quebrar o texto', () => {
    expect(htmlToText('<p>PODER JUDICI&Aacute;RIO &ndash; 2&ordm; Juizado, senten&ccedil;a &amp; decis&atilde;o, &ldquo;ok&rdquo; &#233; &#xE7;</p>'))
      .toBe('PODER JUDICIÁRIO – 2º Juizado, sentença & decisão, “ok” é ç');
    expect(htmlToText('&lt;b&gt; &foo; &amp;lt;')).toBe('<b> &foo; &lt;');
  });
});
