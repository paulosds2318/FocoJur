import { asc, sql } from 'drizzle-orm';
import Link from 'next/link';
import { ActionForm } from '@/components/action-form';
import { db } from '@/db';
import { holiday } from '@/db/schema/task';
import { requireAdmin } from '@/lib/auth/session';
import { dateBr } from '@/lib/format';
import { COMMON_COURT_HOLIDAYS } from '@/db/seed/holidays-data';
import { addCommonHolidaysAction, addHolidayAction, deleteHolidayAction } from './actions';

const SCOPE = { national: 'Nacional', state: 'Estadual', city: 'Municipal', court: 'Tribunal / vara' } as const;
const chip = (on: boolean) => `inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-bold no-underline ${on ? 'border-text bg-text text-on-text hover:text-on-text' : 'border-input-border bg-surface text-soft'}`;

export default async function FeriadosPage({ searchParams }: { searchParams: Promise<{ ano?: string; tipo?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const year = /^\d{4}$/.test(sp.ano ?? '') ? sp.ano! : String(new Date().getFullYear());
  const tipo = (Object.keys(SCOPE) as (keyof typeof SCOPE)[]).find((k) => k === sp.tipo) ?? '';
  const rows = await db.select().from(holiday).where(sql`extract(year from ${holiday.date}) = ${Number(year)} ${tipo ? sql`and ${holiday.scope} = ${tipo}` : sql``}`).orderBy(asc(holiday.date));
  const years = [Number(year) - 1, Number(year), Number(year) + 1];

  return (
    <>
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-extrabold">Feriados e calendário forense</h1>
        <p className="max-w-3xl text-[15px] text-text-muted">Os prazos em dias úteis excluem sábados, domingos e feriados. Os nacionais valem para todos; os estaduais, municipais e do tribunal só entram na conta dos processos daquela UF, cidade ou vara. Sem calendário local cadastrado, a sugestão de prazo avisa “conferir feriados locais”.</p>
      </header>

      <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-novo">
        <h2 id="h-novo" className="text-[17px] font-extrabold">Novo feriado</h2>
        <ActionForm action={addHolidayAction} submitLabel="Cadastrar feriado" className="grid items-end gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1"><span className="label">Tipo</span>
            <select className="input" name="scope" defaultValue="state">{(Object.entries(SCOPE) as [string, string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="flex flex-col gap-1"><span className="label">Data</span><input className="input" type="date" name="date" required /></label>
          <label className="flex flex-col gap-1"><span className="label">Descrição</span><input className="input" name="description" required placeholder="ex.: Aniversário da cidade" /></label>
          <label className="flex flex-col gap-1"><span className="label">UF (estadual e municipal)</span><input className="input" name="state" maxLength={2} /></label>
          <label className="flex flex-col gap-1"><span className="label">Cidade (municipal)</span><input className="input" name="city" /></label>
          <label className="flex flex-col gap-1"><span className="label">Vara/órgão (tribunal)</span><input className="input" name="court" placeholder="parte do nome, como no processo" /></label>
        </ActionForm>
      </section>

      <section className="card flex flex-col gap-3 p-5" aria-labelledby="h-comuns">
        <h2 id="h-comuns" className="text-[17px] font-extrabold">Feriados forenses comuns (Dia do Advogado e Dia da Justiça)</h2>
        <p className="max-w-3xl text-sm text-text-muted">Variam por tribunal (por exemplo, valem na Justiça Federal e do Trabalho e em vários tribunais estaduais), por isso não são nacionais. Escolha para qual UF ou tribunal/vara valem e por quantos anos; o sistema cadastra as datas de uma vez, sem repetir as que já existem.</p>
        <ActionForm action={addCommonHolidaysAction} submitLabel="Cadastrar feriados" className="grid items-end gap-3 sm:grid-cols-3">
          <fieldset className="flex flex-col gap-1.5 sm:col-span-3"><legend className="label">Quais</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">{COMMON_COURT_HOLIDAYS.map((h) => (
              <label key={h.key} className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" name="item" value={h.key} defaultChecked className="size-[18px] accent-primary" /> {h.label} ({h.md.split('-').reverse().join('/')})</label>
            ))}</div></fieldset>
          <label className="flex flex-col gap-1"><span className="label">Vale para</span>
            <select className="input" name="scope" defaultValue="court"><option value="court">Tribunal / vara</option><option value="state">Toda a UF (estadual)</option></select></label>
          <label className="flex flex-col gap-1"><span className="label">Tribunal / vara (parte do nome)</span><input className="input" name="court" placeholder="ex.: Trabalho, Federal, TJSP" /></label>
          <label className="flex flex-col gap-1"><span className="label">UF (se estadual)</span><input className="input" name="state" maxLength={2} /></label>
          <label className="flex flex-col gap-1"><span className="label">Do ano</span><input className="input" type="number" name="from" defaultValue={new Date().getFullYear()} min={2020} max={2100} required /></label>
          <label className="flex flex-col gap-1"><span className="label">Até o ano</span><input className="input" type="number" name="to" defaultValue={new Date().getFullYear() + 1} min={2020} max={2100} required /></label>
        </ActionForm>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Ano" className="flex gap-2">{years.map((y) => <Link key={y} className={chip(String(y) === year)} href={`/admin/feriados?ano=${y}${tipo ? `&tipo=${tipo}` : ''}`}>{y}</Link>)}</div>
        <div role="group" aria-label="Tipo" className="ml-auto flex flex-wrap gap-2">
          <Link className={chip(!tipo)} href={`/admin/feriados?ano=${year}`}>Todos</Link>
          {(Object.entries(SCOPE) as [string, string][]).map(([k, l]) => <Link key={k} className={chip(tipo === k)} href={`/admin/feriados?ano=${year}&tipo=${k}`}>{l}</Link>)}
        </div>
      </div>

      <section className="card pt-2" aria-label="Feriados cadastrados">
        <div className="overflow-x-auto"><table className="tbl">
          <thead><tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Onde vale</th><th></th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="text-text-muted">Nenhum feriado neste filtro.</td></tr>}
            {rows.map((h) => (
              <tr key={h.id}>
                <td className="whitespace-nowrap font-bold">{dateBr(h.date)}</td><td>{h.description}</td><td><span className={`badge ${h.scope === 'national' ? 'b-gray' : 'b-pur'}`}>{SCOPE[h.scope]}</span></td>
                <td>{h.scope === 'national' ? 'Todo o país' : h.scope === 'state' ? h.state : h.scope === 'city' ? `${h.city} - ${h.state}` : h.court}</td>
                <td className="text-right"><form action={deleteHolidayAction}><input type="hidden" name="id" value={h.id} /><button className="btn-ghost" type="submit">Excluir</button></form></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
