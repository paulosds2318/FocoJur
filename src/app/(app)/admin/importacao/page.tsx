import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { requireAdmin } from '@/lib/auth/session';
import { dateTimeBr } from '@/lib/format';
import { listBatches, MAX_FILE_BYTES } from '@/server/base-import';
import { uploadAction } from './actions';

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Aguardando confirmação', cls: 'b-yel' }, running: { label: 'Importando…', cls: 'b-yel' },
  done: { label: 'Concluída', cls: 'b-teal' }, error: { label: 'Erro', cls: 'b-red' },
};

export default async function ImportacaoPage() {
  await requireAdmin();
  const batches = await listBatches();
  return (
    <>
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-extrabold">Importação da base atual</h1>
        <p className="text-[15px] text-text-muted">
          Traz para o FocoJur os processos que o Jurídico já tem na planilha Contencioso, tanto os <strong>em andamento</strong> (ficam com monitoramento ligado) quanto os
          <strong> concluídos</strong> (entram só para consulta). Você confere o de-para das colunas, vê a prévia e confirma. Processos que já existem são pulados, e as publicações
          que já estavam esperando na Triagem passam a ser do processo importado, e as publicações delas ficam no histórico dele (aba Andamentos), sem gerar alerta. Só as atualizações que chegarem depois viram alerta.
        </p>
      </header>

      <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-envio">
        <h2 id="h-envio" className="text-[17px] font-extrabold">1. Enviar a planilha</h2>
        <ActionForm action={uploadAction} submitLabel="Enviar e conferir" pendingLabel="Lendo a planilha…" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1"><span className="label">Arquivo Excel (.xlsx, até {Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)</span>
            <input className="input py-1.5" type="file" name="file" accept=".xlsx" required /></label>
        </ActionForm>
        <p className="text-xs text-text-muted">Nada é gravado agora: o envio só abre a tela de mapeamento e prévia.</p>
      </section>

      <section className="card pt-2" aria-label="Importações anteriores">
        <div className="px-4 pb-1 pt-3 text-base font-extrabold text-soft">Importações anteriores</div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Quando</th><th>Arquivo</th><th>Situação</th><th>Criados</th><th>Já existiam</th><th></th></tr></thead>
            <tbody>
              {batches.length === 0 && <tr><td colSpan={6} className="text-text-muted">Nenhuma importação ainda.</td></tr>}
              {batches.map((b) => {
                const sum = (b.summary ?? {}) as Record<string, number>;
                const st = STATUS[b.status];
                return (
                  <tr key={b.id}>
                    <td className="whitespace-nowrap">{dateTimeBr(b.createdAt)}</td>
                    <td className="font-bold">{b.fileName}</td>
                    <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                    <td>{b.status === 'done' ? `${sum.created ?? 0} (${sum.createdClosed ?? 0} concluídos)` : '—'}</td>
                    <td>{b.status === 'done' ? sum.existing ?? 0 : '—'}</td>
                    <td className="text-right"><Link className="font-bold" href={`/admin/importacao/${b.id}`}>{b.status === 'draft' ? 'Continuar' : 'Abrir'}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
