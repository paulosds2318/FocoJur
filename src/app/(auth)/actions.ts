'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { completeFirstAccess, login } from '@/server/users';

export type FormState = { error?: string } | undefined;

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function loginAction(_: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return { error: 'Informe e-mail e senha.' };
  const res = await login(parsed.data.email, parsed.data.password);
  if (!res.ok) return { error: res.error };
  redirect('/inicio'); // o layout redireciona para /primeiro-acesso se for senha temporária
}

export async function firstAccessAction(_: FormState, formData: FormData): Promise<FormState> {
  const res = await completeFirstAccess(String(formData.get('password') ?? ''), String(formData.get('confirm') ?? ''));
  if (!res.ok) return { error: res.error };
  redirect('/inicio');
}
