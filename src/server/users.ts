import { headers } from 'next/headers';
import { and, asc, eq, gte, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { account, auditLog, session, user } from '@/db/schema';
import { auth } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { generateTempPassword, tempPasswordExpiry, validateNewPassword } from '@/lib/auth/password';

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

/** RF-64a: login com bloqueio temporário após 5 tentativas erradas; RF-63: senha temporária expirada não entra. */
export async function login(emailRaw: string, password: string): Promise<Result> {
  const email = emailRaw.trim().toLowerCase();
  const since = new Date(Date.now() - LOCK_MINUTES * 60_000);
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'login_failed'), eq(auditLog.entityId, email), gte(auditLog.at, since)));
  if (n >= MAX_ATTEMPTS) {
    return { ok: false, error: `Muitas tentativas. Tente de novo em ${LOCK_MINUTES} minutos ou fale com um administrador.` };
  }

  const [u] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  if (u && u.active === false) return { ok: false, error: 'Usuário desativado. Fale com um administrador.' };
  if (u?.mustChangePassword && u.tempPasswordExpiresAt && u.tempPasswordExpiresAt < new Date()) {
    return { ok: false, error: 'Senha temporária expirada. Peça uma nova a um administrador.' };
  }

  try {
    const res = await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
    await audit({ actorId: res.user.id, entity: 'user', entityId: res.user.id, action: 'login' });
    return { ok: true };
  } catch {
    await audit({ actorId: u?.id ?? null, entity: 'user', entityId: email, action: 'login_failed' });
    return { ok: false, error: 'E-mail ou senha incorretos.' };
  }
}

/** RF-62: troca obrigatória da senha temporária. */
export async function completeFirstAccess(next: string, confirm: string): Promise<Result> {
  const sess = await auth.api.getSession({ headers: await headers() });
  if (!sess) return { ok: false, error: 'Sessão expirada. Entre novamente.' };
  const ctx = await auth.$context;
  const [cred] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, sess.user.id), eq(account.providerId, 'credential')))
    .limit(1);
  if (!cred?.password) return { ok: false, error: 'Conta sem senha cadastrada.' };

  const err = validateNewPassword(next, confirm);
  if (err) return { ok: false, error: err };
  if (await ctx.password.verify({ hash: cred.password, password: next })) {
    return { ok: false, error: 'A nova senha deve ser diferente da temporária.' };
  }

  const hash = await ctx.password.hash(next);
  await db.update(account).set({ password: hash }).where(eq(account.id, cred.id));
  await db
    .update(user)
    .set({ mustChangePassword: false, tempPasswordExpiresAt: null })
    .where(eq(user.id, sess.user.id));
  await db.delete(session).where(and(eq(session.userId, sess.user.id), ne(session.id, sess.session.id)));
  await audit({ actorId: sess.user.id, entity: 'user', entityId: sess.user.id, action: 'password_change' });
  return { ok: true };
}

export async function createUser(
  actorId: string,
  input: { name: string; email: string; role: 'admin' | 'lawyer' | 'viewer' },
): Promise<Result<{ tempPassword: string; email: string }>> {
  const email = input.email.trim().toLowerCase();
  const tempPassword = generateTempPassword();
  try {
    // o plugin admin tipa só admin|user; nossos perfis (lawyer, viewer) são aceitos em runtime
    const created = await auth.api.createUser({
      body: { email, password: tempPassword, name: input.name.trim(), role: input.role as 'admin' },
      headers: await headers(),
    });
    await db
      .update(user)
      .set({ mustChangePassword: true, tempPasswordExpiresAt: tempPasswordExpiry(), createdBy: actorId, active: true })
      .where(eq(user.id, created.user.id));
    await audit({
      actorId,
      entity: 'user',
      entityId: created.user.id,
      action: 'create',
      diff: { after: { email, name: input.name, role: input.role } },
    });
    return { ok: true, tempPassword, email };
  } catch {
    return { ok: false, error: 'Não foi possível criar o usuário. O e-mail já pode estar em uso.' };
  }
}

/** RF-64: nova senha temporária (também serve para "esqueci minha senha"). */
export async function resetTempPassword(actorId: string, userId: string): Promise<Result<{ tempPassword: string }>> {
  const tempPassword = generateTempPassword();
  try {
    await auth.api.setUserPassword({ body: { userId, newPassword: tempPassword }, headers: await headers() });
    await db
      .update(user)
      .set({ mustChangePassword: true, tempPasswordExpiresAt: tempPasswordExpiry() })
      .where(eq(user.id, userId));
    await db.delete(session).where(eq(session.userId, userId));
    await audit({ actorId, entity: 'user', entityId: userId, action: 'temp_password_generated' });
    return { ok: true, tempPassword };
  } catch {
    return { ok: false, error: 'Não foi possível gerar a senha temporária.' };
  }
}

export async function setUserActive(actorId: string, userId: string, active: boolean): Promise<Result> {
  if (!active && actorId === userId) return { ok: false, error: 'Você não pode desativar a si mesmo.' };
  await db.update(user).set({ active, banned: !active }).where(eq(user.id, userId));
  if (!active) await db.delete(session).where(eq(session.userId, userId)); // perde as sessões na hora
  await audit({ actorId, entity: 'user', entityId: userId, action: 'update', diff: { after: { active } } });
  return { ok: true };
}

export function listUsers() {
  return db.select().from(user).orderBy(asc(user.name));
}
