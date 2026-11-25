import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { AuthShell } from '../auth-shell';
import { FirstAccessForm } from './form';

export default async function PrimeiroAcessoPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const u = session.user as typeof session.user & { mustChangePassword?: boolean };
  if (!u.mustChangePassword) redirect('/inicio');
  return (
    <AuthShell>
      <FirstAccessForm firstName={session.user.name.split(' ')[0]} />
    </AuthShell>
  );
}
