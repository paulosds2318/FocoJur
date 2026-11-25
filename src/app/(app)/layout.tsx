import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { requireUser, roleLabel } from '@/lib/auth/session';
import { inboxCounts } from '@/server/inbox';
import { pendingTriageCount } from '@/server/movements';
import { AlertBell } from '@/components/alert-bell';
import { BackProvider } from '@/components/back-button';
import { MobileNav } from '@/components/mobile-nav';
import { formatCaseNumber } from '@/lib/case-number';
import { dateTimeBr } from '@/lib/format';
import { recentPending } from '@/server/alerts';
import { ThemeToggle } from '@/components/theme-toggle';
import { NavLinks } from './nav-links';

async function signOutAction() {
  'use server';
  await auth.api.signOut({ headers: await headers() });
  redirect('/login');
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  const isAdmin = session.user.role === 'admin';
  const [inbox, triage, recent] = await Promise.all([inboxCounts(), pendingTriageCount(), recentPending(8)]);
  return (
    <div className="flex min-h-screen flex-wrap bg-bg">
      <nav aria-label="Menu principal" className="flex flex-[1_1_240px] flex-col gap-0.5 border-r border-border bg-surface px-3 py-6 md:sticky md:top-0 md:h-screen md:max-w-[260px] md:self-start">
        <div className="flex shrink-0 items-center gap-2.5 px-3.5 pb-5">
          <div className="flex size-9 items-center justify-center rounded-[10px] bg-brand text-lg font-extrabold text-white">F</div>
          <div className="text-xl font-extrabold">Foco<span className="text-link">Jur</span></div>
        </div>
        <MobileNav>
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pb-3">
            <NavLinks isAdmin={isAdmin} badges={{ '/triagem': inbox.all, '/alertas': triage }} />
          </div>
          <div className="flex shrink-0 flex-col gap-2 border-t border-border px-3.5 pt-4">
            <div>
              <div className="text-sm font-extrabold">{session.user.name}</div>
              <div className="text-xs text-text-muted">{roleLabel(session.user.role)}</div>
            </div>
            <form action={signOutAction}>
              <button className="btn-secondary w-full" type="submit">Sair da conta</button>
            </form>
          </div>
        </MobileNav>
      </nav>
      <AlertBell
        total={triage}
        items={recent.map((m) => ({
          id: m.id, label: m.caseNumber ? formatCaseNumber(m.caseNumber) : (m.title ?? 'Sem processo vinculado'),
          text: (m.summary ?? m.rawText ?? '').replace(/\s+/g, ' ').slice(0, 120), when: `chegou em ${dateTimeBr(m.arrivedAt)}`,
        }))}
      />
      <ThemeToggle />
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-5 px-8 pb-8 pt-[72px]"><BackProvider>{triage > 0 && (
          <Link href="/alertas" aria-label="Atualizações de processos aguardando decisão" className="flex flex-wrap items-center gap-2 rounded-control border border-danger bg-danger-bg px-4 py-2.5 text-sm font-bold text-danger no-underline hover:text-danger">
            <span className="badge b-red">{triage}</span> {triage === 1 ? 'atualização de processo aguarda' : 'atualizações de processos aguardam'} sua decisão: criar tarefa ou ignorar. Ver alertas
          </Link>
        )}
        {children}</BackProvider></main>
    </div>
  );
}
