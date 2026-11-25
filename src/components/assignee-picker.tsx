'use client';

import { useState } from 'react';

/**
 * Responsáveis da tarefa: uma ou várias pessoas (como no Planner). Marque quem for; nenhuma marcada = sem responsável.
 * Os ids saem em um campo oculto `name` (separados por vírgula), na ordem em que foram marcados: o primeiro é o principal.
 */
export function AssigneePicker({ options, defaultIds = [], name = 'assigneeIds', label = 'Responsáveis' }: {
  options: { id: string; label: string }[]; defaultIds?: string[]; name?: string; label?: string;
}) {
  const [ids, setIds] = useState<string[]>(defaultIds);
  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  return (
    <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
      <legend className="label">{label} <span className="font-normal text-text-muted">(marque uma ou mais pessoas; nenhuma = sem responsável)</span></legend>
      <input type="hidden" name={name} value={ids.join(',')} />
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-control border border-input-border bg-surface px-3 py-2">
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-sm font-bold">
            <input type="checkbox" className="size-[18px] accent-primary" checked={ids.includes(o.id)} onChange={() => toggle(o.id)} aria-label={`Responsável: ${o.label}`} />
            {o.label}
          </label>
        ))}
        {options.length === 0 && <span className="text-sm text-text-muted">Nenhuma pessoa disponível.</span>}
      </div>
    </fieldset>
  );
}
