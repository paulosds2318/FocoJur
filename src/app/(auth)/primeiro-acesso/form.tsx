'use client';

import { useActionState } from 'react';
import { firstAccessAction } from '../actions';

export function FirstAccessForm({ firstName }: { firstName: string }) {
  const [state, action, pending] = useActionState(firstAccessAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <h2 className="text-[26px] font-extrabold">Crie sua senha definitiva</h2>
        <p className="mt-1.5 text-[15px] text-text-muted">
          Olá, {firstName}. Você entrou com uma senha temporária. Para continuar, defina a sua senha.
        </p>
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="label">Nova senha</span>
        <input className="input" name="password" type="password" autoComplete="new-password" required />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">Confirme a nova senha</span>
        <input className="input" name="confirm" type="password" autoComplete="new-password" required />
      </label>
      <ul className="list-disc pl-[18px] text-[13px] leading-relaxed text-soft">
        <li>Mínimo de 10 caracteres</li>
        <li>Letras e números</li>
        <li>Diferente da senha temporária</li>
      </ul>
      {state?.error && (
        <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm font-bold text-danger">{state.error}</p>
      )}
      <button className="btn min-h-11" type="submit" disabled={pending}>{pending ? 'Salvando…' : 'Salvar e entrar'}</button>
      <p className="text-center text-[13px] text-text-muted">
        Enquanto a senha definitiva não for criada, nenhuma outra tela fica disponível.
      </p>
    </form>
  );
}
