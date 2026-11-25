'use client';

import { useActionState, useState } from 'react';
import { createCaseAction } from '../actions';

type Opt = { id: string; label: string };

function Field({ label, error, children, span }: { label: string; error?: string; children: React.ReactNode; span?: boolean }) {
  return (
    <label className={`flex flex-col gap-1 ${span ? 'sm:col-span-2' : ''}`}>
      <span className="label">{label}</span>
      {children}
      {error && <span className="text-xs font-bold text-danger">{error}</span>}
    </label>
  );
}

function Sel({ name, opts, value }: { name: string; opts: Opt[]; value?: string }) {
  return (
    <select className="input" name={name} defaultValue={value ?? ''}>
      <option value="">Selecione</option>
      {opts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  );
}

export function NewCaseForm(p: { systems: Opt[]; courtTypes: Opt[]; subjects: Opt[]; claims: Opt[]; owners: Opt[] }) {
  const [state, action, pending] = useActionState(createCaseAction, undefined);
  const [portfolio, setPortfolio] = useState('civil');
  const civil = portfolio === 'civil';
  const err = (k: string) => state?.fields?.[k];
  // o React 19 limpa o formulário após a action: devolvemos o que foi digitado para não perder dados no erro
  const v = (k: string) => state?.values?.[k] ?? '';
  const text = (name: string, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input className="input" name={name} defaultValue={v(name)} {...extra} />
  );

  return (
    <form action={action} key={`${state?.error ?? 'novo'}`} className="flex flex-col gap-5">
      <section className="card grid gap-3.5 p-5 sm:grid-cols-2" aria-labelledby="h-dados">
        <h2 id="h-dados" className="text-[17px] font-extrabold sm:col-span-2">Dados do processo</h2>
        <Field error={err('number')} label="Número do processo">{text('number', { required: true, placeholder: '0000000-00.0000.0.00.0000' })}</Field>
        <Field label="Carteira">
          <select className="input" name="portfolio" value={portfolio} onChange={(e) => setPortfolio(e.target.value)}>
            <option value="civil">Cível</option><option value="labor">Trabalhista</option><option value="procon">Procon</option>
          </select>
        </Field>
        <Field label="Sistema / portal"><Sel name="systemId" opts={p.systems} value={v('systemId')} /></Field>
        <Field label="Foro / esfera"><Sel name="courtTypeId" opts={p.courtTypes} value={v('courtTypeId')} /></Field>
        <Field label="Vara / órgão" span>{text('court')}</Field>
        <Field label="UF">{text('state', { maxLength: 2 })}</Field>
        <Field label="Comarca / cidade">{text('city')}</Field>
        <Field label="Demandante">{text('plaintiff')}</Field>
        <Field label="Loja / centro de custo">{text('costCenter', { placeholder: 'ex.: POA' })}</Field>
        <Field label="Recebido em">{text('receivedAt', { type: 'date' })}</Field>
        <Field label="Citação em">{text('citedAt', { type: 'date' })}</Field>
        <Field error={err('ownerId')} label={`Advogada responsável${civil ? ' *' : ''}`}><Sel name="ownerId" opts={p.owners} value={v('ownerId')} /></Field>
        <Field error={err('contractCode')} label="Contrato (locação)">{text('contractCode', { placeholder: 'POA004871-26' })}</Field>
        <Field label="Detalhamento" span><textarea className="input min-h-20 py-2" name="details" defaultValue={v('details')} /></Field>
      </section>

      <section className="card grid gap-3.5 p-5 sm:grid-cols-2" aria-labelledby="h-risco">
        <h2 id="h-risco" className="text-[17px] font-extrabold sm:col-span-2">Objeto e risco</h2>
        {civil && (
          <>
            <Field error={err('subjectId')} label="Objeto *"><Sel name="subjectId" opts={p.subjects} value={v('subjectId')} /></Field>
            <Field label="Pedido"><Sel name="claimId" opts={p.claims} value={v('claimId')} /></Field>
          </>
        )}
        <Field error={err('prognosis')} label={`Prognóstico${civil ? ' *' : ''}`}>
          <select className="input" name="prognosis" defaultValue={v('prognosis')}>
            <option value="">Selecione</option><option value="probable">Provável</option><option value="possible">Possível</option><option value="remote">Remoto</option>
          </select>
        </Field>
        <Field label="Valor da causa (R$)">{text('claimValue', { inputMode: 'decimal', placeholder: '12.450,00' })}</Field>
        <Field error={err('riskTotal')} label={`Valor de risco total (R$)${civil ? ' *' : ''}`}>{text('riskTotal', { inputMode: 'decimal', placeholder: 'Em branco = fórmula do risco' })}</Field>
        <Field error={err('riskMaterial')} label="Risco dano material (R$)">{text('riskMaterial', { inputMode: 'decimal' })}</Field>
        <Field label="Risco dano moral (R$)">{text('riskMoral', { inputMode: 'decimal' })}</Field>
      </section>

      {state?.error && <p role="alert" className="rounded-control bg-danger-bg px-3 py-2 text-sm font-bold text-danger">{state.error}</p>}
      <div className="flex gap-2">
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Salvando…' : 'Cadastrar processo'}</button>
      </div>
    </form>
  );
}
