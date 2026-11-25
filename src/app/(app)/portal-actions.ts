'use server';

import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/components/action-form';
import { requireRole } from '@/lib/auth/session';
import { enqueuePortalFetch } from '@/server/portal';

/**
 * RF-17: "Buscar dados públicos". Com adaptador de portal liberado enfileira o robô; sem adaptador consulta o DataJud
 * (API pública do CNJ) e completa só os campos vazios da capa. Nunca sobrescreve o que foi digitado.
 */
export async function portalFetchAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireRole('admin', 'lawyer');
  const r = await enqueuePortalFetch(String(fd.get('number') ?? ''), 'manual', { actorId: s.user.id });
  revalidatePath('/caixa-entrada');
  revalidatePath('/triagem');
  return r.ok ? { message: r.message } : { error: r.message };
}
