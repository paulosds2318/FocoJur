'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { createUser, resetTempPassword, setUserActive } from '@/server/users';

export type CreateState =
  | { error?: string; created?: { name: string; email: string; tempPassword: string } }
  | undefined;

const createSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome.'),
  email: z.string().trim().email('E-mail inválido.'),
  role: z.enum(['admin', 'lawyer', 'viewer']),
});

export async function createUserAction(_: CreateState, formData: FormData): Promise<CreateState> {
  const session = await requireAdmin();
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const res = await createUser(session.user.id, parsed.data);
  if (!res.ok) return { error: res.error };
  revalidatePath('/admin/usuarios');
  return { created: { name: parsed.data.name, email: res.email, tempPassword: res.tempPassword } };
}

export type ResetState = { error?: string; tempPassword?: string; userId?: string } | undefined;

export async function resetPasswordAction(_: ResetState, formData: FormData): Promise<ResetState> {
  const session = await requireAdmin();
  const userId = String(formData.get('userId'));
  const res = await resetTempPassword(session.user.id, userId);
  revalidatePath('/admin/usuarios');
  return res.ok ? { tempPassword: res.tempPassword, userId } : { error: res.error, userId };
}

export async function toggleActiveAction(formData: FormData) {
  const session = await requireAdmin();
  await setUserActive(session.user.id, String(formData.get('userId')), formData.get('active') === 'true');
  revalidatePath('/admin/usuarios');
}
