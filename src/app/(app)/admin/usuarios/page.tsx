import { requireAdmin, roleLabel } from '@/lib/auth/session';
import { listUsers } from '@/server/users';
import { toggleActiveAction } from './actions';
import { CreateUserForm, ResetPasswordButton } from './forms';

function situation(u: Awaited<ReturnType<typeof listUsers>>[number]) {
  if (u.active === false) return { text: 'Desativado', cls: 'b-gray' };
  if (u.mustChangePassword) {
    const exp = u.tempPasswordExpiresAt;
    if (exp && exp < new Date()) return { text: 'Senha temporária expirada', cls: 'b-red' };
    return { text: 'Aguardando primeiro acesso', cls: 'b-yel' };
  }
  return { text: 'Ativo', cls: 'b-teal' };
}

export default async function UsuariosPage() {
  const session = await requireAdmin();
  const users = await listUsers();
  return (
    <>
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-extrabold">Usuários</h1>
        <p className="text-[15px] text-text-muted">
          Não existe cadastro aberto: só um admin cria contas. A pessoa entra com a senha temporária e cria a definitiva no primeiro acesso.
        </p>
      </header>
      <div className="flex flex-wrap items-start gap-5">
        <div className="flex-[1_1_320px]"><CreateUserForm /></div>
        <section className="card flex min-w-0 flex-[3_1_560px] flex-col gap-2 pt-5" aria-labelledby="h-users">
          <h2 id="h-users" className="mx-3 text-[17px] font-extrabold">Pessoas</h2>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Nome</th><th>Perfil</th><th>Situação</th><th>Ações</th></tr></thead>
              <tbody>
                {users.map((u) => {
                  const s = situation(u);
                  const active = u.active !== false;
                  return (
                    <tr key={u.id}>
                      <td><div className="font-extrabold">{u.name}</div><div className="text-xs text-text-muted">{u.email}</div></td>
                      <td>{roleLabel(u.role)}</td>
                      <td><span className={`badge ${s.cls}`}>{s.text}</span></td>
                      <td className="whitespace-nowrap">
                        <ResetPasswordButton userId={u.id} label="Nova senha temporária" />
                        {u.id !== session.user.id && (
                          <form action={toggleActiveAction} className="inline">
                            <input type="hidden" name="userId" value={u.id} />
                            <input type="hidden" name="active" value={String(!active)} />
                            <button className="btn-ghost" type="submit">{active ? 'Desativar' : 'Reativar'}</button>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
