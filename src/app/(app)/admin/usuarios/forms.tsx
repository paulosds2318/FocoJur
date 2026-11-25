'use client';

import { useActionState } from 'react';
import { createUserAction, resetPasswordAction } from './actions';

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUserAction, undefined);
  return (
    <section className="card flex flex-col gap-3.5 p-5" aria-labelledby="h-novo">
      <h2 id="h-novo" className="text-[17px] font-extrabold">Criar usuário</h2>
      <form action={action} key={state?.created?.email ?? 'form'} className="flex flex-col gap-3.5">
        <label className="flex flex-col gap-1"><span className="label">Nome</span><input className="input" name="name" required placeholder="Nome completo" /></label>
        <label className="flex flex-col gap-1"><span className="label">E-mail (login)</span><input className="input" name="email" type="email" required placeholder="nome@empresa.com.br" /></label>
        <label className="flex flex-col gap-1">
          <span className="label">Perfil</span>
          <select className="input" name="role" defaultValue="lawyer">
            <option value="lawyer">Advogado(a)</option>
            <option value="admin">Admin</option>
            <option value="viewer">Leitura</option>
          </select>
        </label>
        <div className="rounded-control bg-bg p-3 text-[13px] leading-normal text-soft">
          <strong>Perfis.</strong> Admin: tudo, inclusive usuários, listas, modelos e custos de IA. Advogado(a): processos, tarefas e caixa de entrada. Leitura: consulta e painéis.
        </div>
        {state?.error && <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm font-bold text-danger">{state.error}</p>}
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Criando…' : 'Criar usuário'}</button>
      </form>
      {state?.created && (
        <div role="status" className="flex flex-col gap-1 rounded-control bg-ok-bg p-3 text-sm text-ok">
          <strong>Usuário criado: {state.created.name}</strong>
          <span>Senha temporária (aparece só agora, vale 72 horas). Passe à pessoa por um canal seguro:</span>
          <code className="select-all rounded bg-surface px-2 py-1.5 text-base font-bold tracking-wide text-text">{state.created.tempPassword}</code>
        </div>
      )}
    </section>
  );
}

export function ResetPasswordButton({ userId, label }: { userId: string; label: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);
  return (
    <form action={action} className="inline-flex flex-col items-start">
      <input type="hidden" name="userId" value={userId} />
      <button className="btn-ghost" type="submit" disabled={pending}>{label}</button>
      {state?.tempPassword && state.userId === userId && (
        <code className="select-all rounded bg-ok-bg px-2 py-1 text-xs font-bold text-ok" title="Aparece só agora">{state.tempPassword}</code>
      )}
      {state?.error && <span className="text-xs font-bold text-danger">{state.error}</span>}
    </form>
  );
}
