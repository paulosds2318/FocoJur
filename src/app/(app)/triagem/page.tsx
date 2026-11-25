import { requireUser } from '@/lib/auth/session';
import { parsePage } from '@/lib/pagination';
import { NovosProcessos } from './novos';

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function TriagemPage({ searchParams }: { searchParams: Promise<SP> }) {
  const session = await requireUser();
  const sp = await searchParams;
  const canWrite = session.user.role !== 'viewer';
  const href = (o: { item?: string; np?: string }) => {
    const p = new URLSearchParams();
    if (o.item) p.set('item', o.item);
    if (o.np && o.np !== '1') p.set('np', o.np);
    const q = p.toString();
    return q ? `/triagem?${q}` : '/triagem';
  };

  return (
    <>
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-extrabold">Triagem</h1>
        <p className="text-[15px] text-text-muted">Distribuições: processos novos que chegaram do Projuris, do Domicílio e dos diários e ainda não existem no FocoJur. Classifique, confirme (já podendo criar a tarefa com prazo), marque como duplicado ou descarte. O que não virar tarefa segue para Processos. Novidades de processos já cadastrados ficam em Alertas; a Caixa de entrada é só consulta.</p>
      </header>

      <NovosProcessos itemId={one(sp.item)} page={parsePage(sp.np)} canWrite={canWrite} userId={session.user.id} href={href} />
    </>
  );
}
