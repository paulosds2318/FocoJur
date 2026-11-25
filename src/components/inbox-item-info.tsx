import Link from 'next/link';
import { formatCaseNumber } from '@/lib/case-number';
import type { Publication } from '@/server/inbox';
import type { ParsedWithAi } from '@/server/inbox-ai';

export const INBOX_SRC: Record<string, { label: string; cls: string }> = {
  projuris_api: { label: 'Projuris', cls: 'b-pur' }, import: { label: 'Projuris', cls: 'b-pur' }, domicilio: { label: 'Domicílio', cls: 'b-teal' },
  djen_term: { label: 'DJEN por termos', cls: 'b-yel' }, manual: { label: 'Cadastro manual', cls: 'b-gray' },
};
export const INBOX_SIT: Record<string, { label: string; cls: string }> = {
  new: { label: 'Novo', cls: 'b-red' }, in_review: { label: 'Em revisão', cls: 'b-gray' }, possible_duplicate: { label: 'Possível duplicado', cls: 'b-yel' },
  confirmed: { label: 'Confirmado', cls: 'b-teal' }, discarded: { label: 'Descartado', cls: 'b-gray' },
};
export const INBOX_PF = { civil: 'Cível', labor: 'Trabalhista', procon: 'Procon' };

type Item = { caseNumber: string | null; source: string; status: string; duplicateOf: string | null; parsed: unknown; payload: unknown };

/** O que o sistema sabe de um item da caixa (origem, publicações, sugestões da IA). Só leitura; botões entram por `aiActions`. */
export function InboxItemInfo({ item, aiActions, children }: { item: Item; aiActions?: React.ReactNode; children?: React.ReactNode }) {
  const p = (item.parsed ?? {}) as ParsedWithAi;
  const pubs = ((item.payload ?? {}) as { publications?: Publication[] }).publications?.slice().sort((a, b) => b.data.localeCompare(a.data)) ?? [];
  const src = INBOX_SRC[item.source], sit = INBOX_SIT[item.status];
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="label">Processo</span>
        <h2 id="t-rev" className="text-lg font-extrabold">{formatCaseNumber(item.caseNumber ?? '')}</h2>
        <div className="flex flex-wrap gap-1.5"><span className={`badge ${src.cls}`}>{src.label}</span><span className={`badge ${sit.cls}`}>{sit.label}</span></div>
      </div>
      {children}
      {p.obtainedBy && <div className="rounded-control bg-bg px-3 py-2.5 text-[13px]"><strong>{p.obtainedBy}</strong></div>}
      {pubs.length > 0 && (
        <details className="rounded-control bg-bg p-3" open={pubs.length <= 2}>
          <summary className="cursor-pointer text-sm font-extrabold">Publicações do diário ({pubs.length})</summary>
          <div className="mt-2 flex max-h-72 flex-col gap-2.5 overflow-auto">
            {pubs.map((pb) => (
              <div key={pb.id} className="rounded-lg border border-border bg-surface p-2.5 text-[13px]">
                <div className="flex flex-wrap items-center justify-between gap-2"><strong>{pb.tipo}</strong><span className="text-text-muted">{pb.data ? new Date(pb.data).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : ''}{pb.orgao ? ` · ${pb.orgao}` : ''}</span></div>
                <p className="mt-1 leading-normal text-soft">{pb.texto.slice(0, 600)}{pb.texto.length > 600 ? '…' : ''}</p>
                {pb.link && <a className="font-bold" href={pb.link} target="_blank" rel="noreferrer">Abrir no diário</a>}
              </div>
            ))}
          </div>
        </details>
      )}
      {item.status === 'possible_duplicate' && (
        <div className="rounded-control bg-warn-bg px-3 py-2.5 text-[13px] font-bold text-warn">Este número já existe no FocoJur{item.duplicateOf ? <> · <Link href={`/processos/${item.duplicateOf}`}>ver processo</Link></> : ' em outro item da caixa'}.</div>
      )}
      {p.ai && (
        <div className="flex flex-col gap-2.5 rounded-xl border border-ai-border bg-ai-bg p-3.5">
          <div className="text-xs font-extrabold text-ai">Sugestões da IA a partir do texto{p.ai.decision === 'accepted' ? ' · aceitas' : p.ai.decision === 'rejected' ? ' · recusadas' : ''}</div>
          <div className="grid grid-cols-2 gap-2.5 text-sm">
            <div><div className="label">Carteira</div><div className="font-bold">{p.ai.portfolio ? INBOX_PF[p.ai.portfolio] : '—'}</div></div>
            <div><div className="label">Objeto</div><div className="font-bold">{p.ai.subject ?? '—'}</div></div>
            <div><div className="label">Pedido</div><div className="font-bold">{p.ai.claim ?? '—'}</div></div>
            <div><div className="label">Prognóstico</div><div className="font-bold">{{ probable: 'Provável', possible: 'Possível', remote: 'Remoto' }[p.ai.prognosis ?? 'x' as 'probable'] ?? '—'}</div></div>
            <div className="col-span-2"><div className="label">Contrato encontrado</div><div className="font-bold">{p.ai.contracts.length ? p.ai.contracts.join(', ') : '—'} {p.ai.contracts.length > 0 && <span className="badge b-yel">não validado</span>}</div></div>
          </div>
          {p.ai.rationale && <div className="text-[13px] text-soft">{p.ai.rationale}</div>}
          <div className="text-xs text-text-muted">O contrato só é validado após consulta ao sistema de locação (etapa 1b, depende do time do sistema).</div>
          {!p.ai.decision && aiActions}
        </div>
      )}
    </>
  );
}
