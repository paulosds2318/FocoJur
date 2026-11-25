'use client';

import { useState } from 'react';

export type HintOption = { id: string; label: string; description?: string | null };

/**
 * Select de lista oficial que mostra, em texto pequeno logo abaixo, a descrição da opção escolhida
 * (a mesma que a IA lê na Triagem). Continua sendo um <select name=...> comum no formulário.
 */
export function SelectHint({ name, label, options, defaultValue = '', className = '', hintPrefix = '' }: {
  name: string; label: string; options: HintOption[]; defaultValue?: string; className?: string; hintPrefix?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const hint = options.find((o) => o.id === value)?.description;
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="label">{label}</span>
      <select className="input" name={name} value={value} onChange={(e) => setValue(e.target.value)}>
        <option value="">—</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {hint && <span className="text-xs leading-snug text-text-muted" data-testid={`hint-${name}`}>{hintPrefix}{hint}</span>}
    </label>
  );
}
