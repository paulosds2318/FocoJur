'use client';

import { useActionState, useEffect, useRef, startTransition } from 'react';

export type ActionState = { error?: string; message?: string } | undefined;

/**
 * Formulário com Server Action que mostra erro ou confirmação (evita falha silenciosa).
 * O React 19 limpa o formulário depois de toda action; aqui ele só é limpo quando deu certo,
 * para quem errou um campo não perder o que digitou.
 */
export function ActionForm({
  action, children, submitLabel, className = '', variant = 'btn', pendingLabel = 'Salvando…',
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
  variant?: 'btn' | 'btn-secondary' | 'btn-ghost';
  pendingLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.message) ref.current?.reset();
  }, [state]);

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault(); // evita o reset automático do React; a validação nativa (required) já rodou
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {children}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className={variant} type="submit" disabled={pending}>{pending ? pendingLabel : submitLabel}</button>
        {state?.error && <span role="alert" className="text-sm font-bold text-danger">{state.error}</span>}
        {state?.message && <span role="status" className="text-sm font-bold text-ok">{state.message}</span>}
      </div>
    </form>
  );
}
