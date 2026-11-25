import 'dotenv/config';
import path from 'node:path';
import ExcelJS from 'exceljs';

/**
 * Migração do Planner "Rotina Jurídico" (PRD 9.3) a partir da exportação para Excel.
 *   pnpm migrar:planner -- "C:/caminho/Rotina Jurídico.xlsx" --dry-run
 *
 * Tarefas abertas viram `task` (origin = migration); concluídas viram linha de histórico na ficha do processo;
 * tarefas sem número de processo viram tarefas gerais (a confirmar com o Jurídico). Idempotente pelo título + processo + prazo.
 */
async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const file = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  if (!file) {
    console.error('Uso: pnpm migrar:planner -- <arquivo.xlsx> [--dry-run]');
    process.exit(1);
  }
  const { mapPlannerHeaders, rowToPlannerTask, plannerBuckets } = await import('../../src/lib/migration/planner');
  const { norm } = await import('../../src/lib/migration/spreadsheet');
  type PlannerTask = import('../../src/lib/migration/planner').PlannerTask;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(file));
  const tasks: PlannerTask[] = [];
  for (const ws of wb.worksheets) {
    let headerRow = 0;
    let idx: Record<string, number> = {};
    for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
      const m = mapPlannerHeaders((ws.getRow(r).values as unknown[]).slice(1));
      if (m.title !== undefined) { headerRow = r; idx = m; break; }
    }
    if (!headerRow) continue;
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const t = rowToPlannerTask(r, idx, (ws.getRow(r).values as unknown[]).slice(1));
      if (t) tasks.push(t);
    }
  }
  const open = tasks.filter((t) => !t.completed);
  console.log(`Lidas ${tasks.length} tarefas: ${open.length} abertas, ${tasks.length - open.length} concluídas, ${tasks.filter((t) => !t.caseNumber).length} sem número de processo.`);

  const report: { row: number; title: string; issue: string }[] = [];
  const stats = { tasks: 0, history: 0, skipped: 0, general: 0, unmatchedCase: 0, bucketsCreated: 0 };
  const buckets = plannerBuckets(tasks, norm);
  console.log(`Colunas (buckets) do Planner: ${buckets.map((b) => `${b.name} (${b.count})`).join('; ') || 'nenhuma'}.`);

  if (!dryRun) {
    const { db, pool } = await import('../../src/db');
    const { and, eq, isNull } = await import('drizzle-orm');
    const { user, auditLog } = await import('../../src/db/schema');
    const { cases } = await import('../../src/db/schema/case');
    const { lookup } = await import('../../src/db/schema/lookups');
    const { task, taskAssignee } = await import('../../src/db/schema/task');

    const { slug } = await import('../../src/db/seed/lookups-data');
    const types = (await db.select().from(lookup)).filter((l) => l.type === 'task_type');
    // cada bucket do Planner vira uma coluna do quadro (lista oficial task_bucket); a que ainda não existe é criada com o mesmo nome
    const bucketRows = (await db.select().from(lookup)).filter((l) => l.type === 'task_bucket');
    const bucketByName = new Map(bucketRows.map((b) => [norm(b.label), b.id]));
    let nextSort = bucketRows.reduce((m, b) => Math.max(m, b.sort), -1) + 1;
    for (const b of buckets) {
      if (bucketByName.has(norm(b.name))) continue;
      const [row] = await db.insert(lookup).values({ type: 'task_bucket', code: slug(b.name), label: b.name, sort: nextSort++ }).returning({ id: lookup.id });
      bucketByName.set(norm(b.name), row.id);
      stats.bucketsCreated++;
    }
    const users = await db.select().from(user);
    const matchUser = (name: string) => users.find((u) => norm(u.name) === norm(name)) ?? users.find((u) => norm(u.name).startsWith(norm(name).split(' ')[0]));

    for (const t of tasks) {
      let caseId: string | null = null;
      if (t.caseNumber) {
        const [c] = await db.select({ id: cases.id }).from(cases).where(and(eq(cases.number, t.caseNumber), isNull(cases.deletedAt))).limit(1);
        caseId = c?.id ?? null;
        if (!c) { stats.unmatchedCase++; report.push({ row: t.row, title: t.title, issue: `Processo ${t.caseNumber} não existe no FocoJur (virou tarefa geral)` }); }
      }
      for (const n of t.assignees) if (!matchUser(n)) report.push({ row: t.row, title: t.title, issue: `Responsável "${n}" sem usuário` });

      if (t.completed) {
        // concluídas viram histórico do processo, não tarefa
        if (caseId) {
          const dup = await db.select({ id: auditLog.id }).from(auditLog).where(and(eq(auditLog.entityId, caseId), eq(auditLog.action, 'planner_import'), eq(auditLog.entity, `planner:${t.title}`))).limit(1);
          if (dup.length) { stats.skipped++; continue; }
          await db.insert(auditLog).values({ entity: `planner:${t.title}`, entityId: caseId, action: 'planner_import', diff: { bucket: t.bucket, completedAt: t.completedAt, assignees: t.assignees }, at: t.completedAt ? new Date(`${t.completedAt}T12:00:00Z`) : new Date() });
          stats.history++;
        } else stats.skipped++;
        continue;
      }
      const typeId = types.find((x) => norm(x.label) === norm(t.typeLabel ?? 'Geral'))?.id ?? null;
      const existing = await db.select({ id: task.id }).from(task).where(and(eq(task.title, t.title), eq(task.origin, 'migration'))).limit(1);
      if (existing.length) { stats.skipped++; continue; }
      const bucketId = t.bucket ? bucketByName.get(norm(t.bucket)) ?? null : null;
      // todos os atribuídos do Planner que têm usuário no FocoJur viram responsáveis (o primeiro também fica em owner_id)
      const people = [...new Set(t.assignees.map((n) => matchUser(n)?.id).filter((x): x is string => !!x))];
      const [created] = await db.insert(task).values({ title: t.title, caseId, typeId, bucketId, ownerId: people[0] ?? null, dueDate: t.dueDate, origin: 'migration', status: 'todo' }).returning({ id: task.id });
      if (people.length) await db.insert(taskAssignee).values(people.map((userId) => ({ taskId: created.id, userId })));
      stats.tasks++;
      if (!caseId) stats.general++;
    }
    await pool.end();
  }

  console.log(dryRun ? 'Simulação: nada foi gravado.' : `Tarefas criadas: ${stats.tasks} (${stats.general} gerais), colunas novas: ${stats.bucketsCreated}, histórico: ${stats.history}, puladas: ${stats.skipped}.`);
  if (report.length) {
    const out = new ExcelJS.Workbook();
    const ws = out.addWorksheet('Pendências');
    ws.columns = [{ header: 'Linha', key: 'row', width: 8 }, { header: 'Tarefa', key: 'title', width: 60 }, { header: 'Pendência', key: 'issue', width: 80 }];
    ws.getRow(1).font = { bold: true };
    report.forEach((r) => ws.addRow(r));
    await out.xlsx.writeFile('relatorio-planner.xlsx');
    console.log(`Relatório: ${path.resolve('relatorio-planner.xlsx')}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
