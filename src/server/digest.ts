import { and, asc, eq, lte, ne } from 'drizzle-orm';
import { db } from '@/db';
import { user } from '@/db/schema';
import { cases } from '@/db/schema/case';
import { task, taskAssignee } from '@/db/schema/task';
import { isBusinessDay, todayInSaoPaulo } from '@/lib/deadlines';
import { formatCaseNumber } from '@/lib/case-number';
import { dateBr } from '@/lib/format';
import { escapeHtml, sendMail } from '@/lib/mail';
import { getHolidaySet } from './tasks';

/**
 * RF-25: e-mail diário (7h) para cada responsável com prazos do dia e atrasados.
 * Tarefa sem responsável aparece no e-mail de todas as advogadas e administradoras ativas (todo mundo vê o de todo mundo). Retorna quantos e-mails saíram.
 */
export async function sendDailyDeadlineDigest(now = new Date()) {
  const today = todayInSaoPaulo(now);
  const holidays = await getHolidaySet();
  if (!isBusinessDay(today, holidays)) return 0; // sem alerta em fim de semana e feriado

  const rows = await db
    .select({ taskId: task.id, title: task.title, dueDate: task.dueDate, caseNumber: cases.number })
    .from(task)
    .leftJoin(cases, eq(cases.id, task.caseId))
    .where(and(lte(task.dueDate, today), ne(task.status, 'done'), ne(task.status, 'cancelled')))
    .orderBy(asc(task.dueDate));
  const assigned = await db.select({ taskId: taskAssignee.taskId, userId: taskAssignee.userId }).from(taskAssignee);
  const byTask = new Map<string, string[]>();
  for (const a of assigned) byTask.set(a.taskId, [...(byTask.get(a.taskId) ?? []), a.userId]);

  const people = (await db.select().from(user)).filter((u) => u.active !== false && u.role !== 'viewer');
  const recipients = new Map<string, typeof rows>();
  for (const r of rows) {
    // com responsáveis: cada um recebe; sem responsável: todas as pessoas ativas que trabalham as tarefas
    const ids = byTask.get(r.taskId)?.length ? byTask.get(r.taskId)! : people.map((p) => p.id);
    for (const id of ids) recipients.set(id, [...(recipients.get(id) ?? []), r]);
  }

  let sent = 0;
  for (const [userId, list] of recipients) {
    const [u] = await db.select().from(user).where(eq(user.id, userId));
    if (!u || u.active === false) continue;
    const late = list.filter((r) => r.dueDate! < today);
    const due = list.filter((r) => r.dueDate === today);
    const li = (r: (typeof rows)[number]) =>
      `<li>${escapeHtml(r.title)}${r.caseNumber ? ` — ${escapeHtml(formatCaseNumber(r.caseNumber))}` : ''} <em>(${dateBr(r.dueDate)})</em></li>`;
    const html = `<p>Olá, ${escapeHtml(u.name.split(' ')[0])}.</p>
      ${due.length ? `<p><strong>Prazos de hoje (${due.length})</strong></p><ul>${due.map(li).join('')}</ul>` : ''}
      ${late.length ? `<p><strong>Atrasados (${late.length})</strong></p><ul>${late.map(li).join('')}</ul>` : ''}
      <p><a href="${process.env.BETTER_AUTH_URL ?? ''}/tarefas">Abrir o FocoJur</a></p>`;
    await sendMail(u.email, `FocoJur: ${due.length} prazo(s) hoje e ${late.length} atrasado(s)`, html);
    sent++;
  }
  return sent;
}
