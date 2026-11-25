'use client';

import { useActionState } from 'react';
import { compareAction, type CompareState } from './actions';

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);

export function CompareForm({ models }: { models: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<CompareState, FormData>(compareAction, undefined);
  return (
    <section className="card flex flex-col gap-3.5 p-5" aria-labelledby="h-comp">
      <h2 id="h-comp" className="text-[17px] font-extrabold">Comparar modelos antes de trocar</h2>
      <form action={action} className="flex flex-col gap-3">
        <datalist id="cmp-models">{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</datalist>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          <label className="flex flex-col gap-1"><span className="label">Tarefa</span><select className="input" name="task" defaultValue="deadline_suggestion"><option value="deadline_suggestion">Sugestão de prazo</option></select></label>
          <label className="flex flex-col gap-1"><span className="label">Modelo A (atual)</span><input className="input" name="a" list="cmp-models" required /></label>
          <label className="flex flex-col gap-1"><span className="label">Modelo B (candidato)</span><input className="input" name="b" list="cmp-models" required /></label>
          <label className="flex flex-col gap-1"><span className="label">Amostra</span><select className="input" name="size" defaultValue="20"><option value="20">20 movimentações já revisadas</option><option value="50">50 movimentações já revisadas</option></select></label>
        </div>
        <p className="text-[13px] text-text-muted">Roda os dois modelos sobre casos que as advogadas já revisaram e compara acerto (data final igual à decidida por elas), custo e tempo. Não altera nenhum dado nem entra no painel de custos.</p>
        <div className="flex items-center gap-3">
          <button className="btn-secondary" type="submit" disabled={pending}>{pending ? 'Comparando… (pode levar um minuto)' : 'Rodar comparação'}</button>
          {state?.error && <span role="alert" className="text-sm font-bold text-danger">{state.error}</span>}
        </div>
      </form>
      {state?.result && (
        <div className="overflow-x-auto"><table className="tbl">
          <caption className="pb-2 text-left text-[13px] text-text-muted">{state.result.samples} casos revisados usados como gabarito</caption>
          <thead><tr><th>Modelo</th><th className="text-right">Acerto</th><th className="text-right">Erros</th><th className="text-right">Custo médio</th><th className="text-right">Tempo médio</th></tr></thead>
          <tbody>
            {[state.result.a, state.result.b].map((m) => (
              <tr key={m.model}>
                <td className="font-bold">{m.model}</td>
                <td className="text-right tabular-nums">{pct(m.accuracy)} ({m.correct}/{m.n})</td>
                <td className="text-right tabular-nums">{m.errors}</td>
                <td className="text-right tabular-nums">{m.avgCostUsd === null ? '—' : `US$ ${m.avgCostUsd.toFixed(5)}`}</td>
                <td className="text-right tabular-nums">{m.avgLatencyMs === null ? '—' : `${(m.avgLatencyMs / 1000).toFixed(1)} s`}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </section>
  );
}
