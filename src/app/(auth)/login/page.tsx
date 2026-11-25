'use client';

import { useActionState } from 'react';
import { loginAction } from '../actions';
import { AuthShell } from '../auth-shell';

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <AuthShell>
      <form action={action} className="flex flex-col gap-4">
        <div>
          <h2 className="text-[26px] font-extrabold">Entrar</h2>
          <p className="mt-1.5 text-[15px] text-text-muted">
            No primeiro acesso, use a senha temporária que o administrador te passou.
          </p>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="label">E-mail</span>
          <input className="input" name="email" type="email" autoComplete="username" required placeholder="nome@empresa.com.br" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label">Senha</span>
          <input className="input" name="password" type="password" autoComplete="current-password" required />
        </label>
        {state?.error && (
          <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm font-bold text-danger">{state.error}</p>
        )}
        <button className="btn min-h-11" type="submit" disabled={pending}>{pending ? 'Entrando…' : 'Entrar'}</button>
        <p className="text-center text-[13px] text-text-muted">
          Esqueceu a senha ou não tem acesso? Peça a um administrador do FocoJur uma nova senha temporária.
        </p>
      </form>
    </AuthShell>
  );
}
