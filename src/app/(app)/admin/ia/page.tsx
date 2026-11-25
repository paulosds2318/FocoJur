import { ActionForm } from '@/components/action-form';
import { AI_TASKS } from '@/db/schema/ai';
import { requireAdmin } from '@/lib/auth/session';
import { dateTimeBr } from '@/lib/format';
import { TASK_LABEL, taskOverview } from '@/server/ai-admin';
import { saveTaskAction, syncModelsAction } from './actions';
import { CompareForm } from './compare';

const perMillion = (v: string | null) => (v === null ? '—' : (Number(v) * 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 }));
const pct = (v: string | null | undefined) => (v === null || v === undefined ? '—' : `${Math.round(Number(v) * 100)}%`);

export default async function AdminIAPage() {
  await requireAdmin();
  const { configs, stats, catalog, history } = await taskOverview();
  const price = (id?: string | null) => catalog.find((m) => m.modelId === id);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-extrabold">Modelos de IA</h1>
          <p className="text-[15px] text-text-muted">
            Escolha o modelo de cada tarefa, entre os disponíveis no OpenRouter.{' '}
            {catalog[0] ? `Lista sincronizada em ${dateTimeBr(catalog[0].syncedAt)}.` : 'Lista ainda não sincronizada.'}
          </p>
        </div>
        <ActionForm action={syncModelsAction} submitLabel="Sincronizar modelos" variant="btn-secondary" pendingLabel="Sincronizando…" className="flex"><span /></ActionForm>
      </header>

      <section className="flex flex-wrap items-center gap-2.5 rounded-card border border-ok-border bg-ok-soft px-4 py-3.5">
        <span className="badge b-teal">Sempre ativa</span>
        <span className="text-sm"><strong>Política de dados:</strong> toda chamada exige provedores que não guardam nem treinam com os dados (<code>data_collection = deny</code>, retenção zero). CPF, RG e dados bancários são mascarados antes do envio (LGPD).</span>
      </section>

      {!process.env.OPENROUTER_API_KEY && (
        <p role="alert" className="rounded-control bg-warn-bg px-3.5 py-2.5 text-sm font-bold text-warn">OPENROUTER_API_KEY não está definida no servidor: as tarefas de IA ficam desligadas até configurar a chave.</p>
      )}

      <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-tarefas">
        <h2 id="h-tarefas" className="text-[17px] font-extrabold">Modelo por tarefa</h2>
        <datalist id="models">{catalog.map((m) => <option key={m.modelId} value={m.modelId}>{m.name}</option>)}</datalist>
        <div className="flex flex-col divide-y divide-surface-3">
          {AI_TASKS.map((t) => {
            const cfg = configs.find((c) => c.task === t);
            const st = stats.find((s) => s.task === t);
            const p = price(cfg?.primaryModel);
            return (
              <div key={t} className="flex flex-col gap-2 py-3.5">
                <div>
                  <div className="font-extrabold">{TASK_LABEL[t].name}</div>
                  <div className="text-xs text-text-muted">{TASK_LABEL[t].desc}</div>
                </div>
                <ActionForm action={saveTaskAction} submitLabel="Salvar" className="grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <input type="hidden" name="task" value={t} />
                  <label className="flex flex-col gap-1"><span className="label">Modelo principal</span><input className="input" name="primary" list="models" defaultValue={cfg?.primaryModel ?? ''} placeholder="ex.: provedor/modelo" /></label>
                  <label className="flex flex-col gap-1"><span className="label">Modelo reserva</span><input className="input" name="fallback" list="models" defaultValue={cfg?.fallbackModel ?? ''} placeholder="usado se o principal falhar" /></label>
                </ActionForm>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-text-muted">
                  <span>Preço entrada / saída (US$ por 1M tokens): {p ? `${perMillion(p.promptPriceUsd)} / ${perMillion(p.completionPriceUsd)}` : '—'}</span>
                  <span>Aceite (30 dias): {pct(st?.accept)}</span>
                  <span>Custo médio por chamada: {st?.avg_cost ? `R$ ${Number(st.avg_cost).toFixed(4)}` : '—'}</span>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[13px] text-text-muted">Aceite = sugestões confirmadas pelos(as) advogados(as) sem correção. É o principal indicador de qualidade do modelo.</p>
      </section>

      <CompareForm models={catalog.map((m) => ({ id: m.modelId, name: m.name }))} />

      <section className="card flex flex-col gap-2.5 p-5 text-sm" aria-labelledby="h-log">
        <h2 id="h-log" className="text-[17px] font-extrabold">Histórico de trocas</h2>
        {history.length === 0 && <p className="text-text-muted">Nenhuma troca registrada.</p>}
        {history.map((h, i) => (
          <div key={i}><strong>{dateTimeBr(h.at)} · {h.by ?? '—'}</strong><br />{TASK_LABEL[h.task].name}, {h.field === 'primary_model' ? 'principal' : 'reserva'}: {h.oldValue ?? '(nenhum)'} para {h.newValue ?? '(nenhum)'}</div>
        ))}
      </section>
    </>
  );
}
