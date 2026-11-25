'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { redirect } from 'next/navigation';
import type { ActionState } from '@/components/action-form';
import { requireAdmin } from '@/lib/auth/session';
import { FIELDS, type ImportConfig, type Portfolio } from '@/lib/migration/base-import';
import { JOBS, enqueue } from '@/lib/jobs';
import { createBatch, runImport, saveConfig, startImport } from '@/server/base-import';

/** Envia a planilha e abre a tela de mapeamento. */
export async function uploadAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  const file = fd.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Escolha o arquivo Excel (.xlsx).' };
  const res = await createBatch(s.user.id, file.name, Buffer.from(await file.arrayBuffer()));
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/importacao');
  redirect(`/admin/importacao/${res.id}`);
}

/** Lê o formulário de mapeamento (campos `s{i}_...`) e monta a configuração. */
function configFromForm(fd: FormData): ImportConfig {
  const n = Number(fd.get('sheetCount') ?? 0);
  const sheets: ImportConfig['sheets'] = [];
  for (let i = 0; i < n; i++) {
    const columns: Record<string, number | null> = {};
    for (const f of FIELDS) {
      const v = String(fd.get(`s${i}_col_${f.key}`) ?? '');
      columns[f.key] = v === '' ? null : Number(v);
    }
    sheets.push({
      name: String(fd.get(`s${i}_name`) ?? ''), use: fd.get(`s${i}_use`) === 'on', portfolio: String(fd.get(`s${i}_portfolio`) ?? 'civil') as Portfolio,
      closedSheet: fd.get(`s${i}_closed`) === 'on', polarity: fd.get(`s${i}_polarity`) === 'active' ? 'active' : 'passive',
      headerRow: Number(fd.get(`s${i}_header`) ?? 1), columns,
    });
  }
  return { sheets };
}

/** Salva o de-para e recalcula a prévia. */
export async function saveConfigAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  const id = String(fd.get('id'));
  const res = await saveConfig(s.user.id, id, configFromForm(fd));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/admin/importacao/${id}`);
  return { message: 'Mapeamento salvo. A prévia abaixo já usa essas escolhas.' };
}

/** Em produção vai para a fila (o worker executa); em desenvolvimento roda no próprio servidor, depois da resposta. */
async function dispatchImport(id: string, actorId: string) {
  const inline = process.env.JOBS_INLINE ? process.env.JOBS_INLINE === 'true' : process.env.NODE_ENV !== 'production';
  if (inline) {
    after(async () => { await runImport(id, actorId).catch(() => undefined); });
    return;
  }
  await enqueue(JOBS.baseImport, { id, actorId }, { singletonKey: id, singletonSeconds: 60 });
}

/** "Importar agora": inicia, em segundo plano, a importação com o mapeamento já salvo (o mesmo da prévia). */
export async function runImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  const id = String(fd.get('id'));
  const started = await startImport(s.user.id, id);
  if (!started.ok) return { error: started.error };
  await dispatchImport(id, s.user.id);
  revalidatePath('/admin/importacao');
  redirect(`/admin/importacao/${id}`);
}
