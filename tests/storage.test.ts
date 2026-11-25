import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { localDriverAt, s3Driver, safeKey } from '@/lib/storage';

describe('armazenamento de arquivos', () => {
  it('recusa chaves que escapam da pasta', () => {
    expect(safeKey('portal/abc.html')).toBe('portal/abc.html');
    expect(() => safeKey('../segredo')).toThrow();
    expect(() => safeKey('portal/../../x')).toThrow();
    expect(() => safeKey('')).toThrow();
    expect(() => safeKey('a b/c')).toThrow();
  });

  const dirs: string[] = [];
  afterAll(async () => { for (const d of dirs) await rm(d, { recursive: true, force: true }); });

  it('driver local grava e lê', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'focojur-'));
    dirs.push(dir);
    const d = localDriverAt(dir);
    await d.put('portal/x.html', '<p>oi</p>');
    expect((await d.get('portal/x.html')).toString()).toBe('<p>oi</p>');
    await expect(d.put('../fora.txt', 'x')).rejects.toThrow();
  });

  it('driver S3 usa bucket, chave e criptografia', async () => {
    const sent: { name: string; input: Record<string, unknown> }[] = [];
    const fake = {
      send: async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
        sent.push({ name: cmd.constructor.name, input: cmd.input });
        return { Body: { transformToByteArray: async () => new TextEncoder().encode('conteudo') } };
      },
    };
    const d = s3Driver('meu-bucket', fake as never);
    await d.put('portal/y.png', Buffer.from('img'));
    expect(sent[0]).toMatchObject({ name: 'PutObjectCommand', input: { Bucket: 'meu-bucket', Key: 'portal/y.png', ContentType: 'image/png', ServerSideEncryption: 'AES256' } });
    expect((await d.get('portal/y.png')).toString()).toBe('conteudo');
    expect(sent[1].name).toBe('GetObjectCommand');
  });
});
