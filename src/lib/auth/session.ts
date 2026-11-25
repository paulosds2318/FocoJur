import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './index';

export type Role = 'admin' | 'lawyer' | 'viewer';

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/** Exige sessão válida e senha definitiva já criada. */
export async function requireUser() {
  const session = await getSession();
  if (!session) redirect('/login');
  const u = session.user as typeof session.user & { mustChangePassword?: boolean; active?: boolean };
  if (u.active === false) redirect('/login');
  if (u.mustChangePassword) redirect('/primeiro-acesso');
  return session;
}

export async function requireRole(...roles: Role[]) {
  const session = await requireUser();
  const role = (session.user.role ?? 'lawyer') as Role;
  if (!roles.includes(role)) redirect('/inicio');
  return session;
}

export const requireAdmin = () => requireRole('admin');

export function roleLabel(role?: string | null) {
  return role === 'admin' ? 'Admin' : role === 'viewer' ? 'Leitura' : 'Advogado(a)';
}
