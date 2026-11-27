import { afterEach, describe, expect, it } from 'vitest';

describe('/api/cron/[job]', () => {
  const antes = process.env.CRON_SECRET;
  afterEach(() => { if (antes === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = antes; });
  const chama = async (job: string, auth?: string) => {
    const { GET } = await import('@/app/api/cron/[job]/route');
    return GET(new Request(`http://x/api/cron/${job}`, { headers: auth ? { authorization: auth } : {} }), { params: Promise.resolve({ job }) });
  };

  it('sem CRON_SECRET configurado ou com segredo errado: 401', async () => {
    delete process.env.CRON_SECRET;
    expect((await chama('ptax', 'Bearer qualquer')).status).toBe(401);
    process.env.CRON_SECRET = 'segredo-de-teste';
    expect((await chama('ptax')).status).toBe(401);
    expect((await chama('ptax', 'Bearer errado')).status).toBe(401);
  });

  it('segredo certo e rotina desconhecida: 404', async () => {
    process.env.CRON_SECRET = 'segredo-de-teste';
    expect((await chama('nao-existe', 'Bearer segredo-de-teste')).status).toBe(404);
  });
});
