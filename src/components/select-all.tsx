'use client';

/** Marca/desmarca todas as caixas `name` da página (ação em lote). Avisa a barra de seleção pelo evento "change". */
export function SelectAll({ name, form, label = 'Selecionar todos desta página' }: { name: string; form: string; label?: string }) {
  return (
    <label className="flex items-center gap-2 text-sm font-bold text-soft">
      <input
        type="checkbox"
        className="size-[18px] accent-primary"
        onChange={(e) => document.querySelectorAll<HTMLInputElement>(`input[name="${name}"][form="${form}"]`).forEach((c) => {
          if (c.checked !== e.target.checked) { c.checked = e.target.checked; c.dispatchEvent(new Event('change', { bubbles: true })); }
        })}
      />
      {label}
    </label>
  );
}
