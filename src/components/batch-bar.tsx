'use client';

import { useEffect, useState } from 'react';

/**
 * Barra de ações em lote: flutua no rodapé, centralizada, e só aparece quando há itens marcados (com o contador).
 * Os botões e o seletor pertencem ao <form id={form}> (atributo `form`), então podem ficar fora dele.
 * O alerta só sai da fila ao ser ignorado (com motivo) ou ao virar tarefa: "Ignorar selecionados" exige o motivo (o navegador avisa).
 */
export function BatchBar({ name, form, reasons }: { name: string; form: string; reasons: readonly string[] }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const count = () => setN(document.querySelectorAll(`input[name="${name}"][form="${form}"]:checked`).length);
    document.addEventListener('change', count);
    return () => document.removeEventListener('change', count);
  }, [name, form]);
  if (n === 0) return null;
  return (
    <div
      role="region" aria-label="Ações em lote"
      className="fixed bottom-4 left-1/2 z-30 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-card border border-border bg-surface px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.18)]"
    >
      <span className="rounded-full bg-text px-3 py-1 text-[13px] font-extrabold text-on-text" aria-live="polite">{n} {n === 1 ? 'selecionado' : 'selecionados'}</span>
      <select form={form} className="input w-56" name="reason" defaultValue="" required aria-label="Motivo para ignorar">
        <option value="" disabled>Motivo para ignorar…</option>
        {reasons.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <button form={form} className="btn" type="submit" name="op" value="discard">Ignorar selecionados</button>
    </div>
  );
}
