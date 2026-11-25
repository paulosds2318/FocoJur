import 'dotenv/config';
import { eq, inArray, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** Prazo limite x interno, filtros de responsável e dia, alerta virando tarefa, fórmula do risco e trilha de auditoria. */
const TAG = 'TESTE-ALR';
let adminId: string;
let otherId: string;
let caseId: string;
const taskIds: string[] = [];
const movIds: string[] = [];
/** Formulário completo, como o navegador envia (campos vazios vêm como texto vazio). */
const form = (o: Record<string, string>) => ({ caseId: '', typeId: '', dueDate: '', internalDueDate: '', dueTime: '', ownerId: '', reviewerId: '', movementId: '', ...o });

async function limpa() {
  const { db } = await import('@/db');
  const { auditLog, user } = await import('@/db/schema');
  const { cases } = await import('@/db/schema/case');
  const { task } = await import('@/db/schema/task');
  const { movement } = await import('@/db/schema/movement');
  const { appSetting } = await import('@/db/schema/inbox');
  const t = await db.select({ id: task.id }).from(task).where(like(task.title, `${TAG}%`));
  const m = await db.select({ id: movement.id }).from(movement).where(like(movement.externalId, `${TAG}%`));
  const ids = [...t.map((x) => x.id), ...m.map((x) => x.id)];
  if (ids.length) await db.delete(auditLog).where(inArray(auditLog.entityId, ids));
  if (t.length) await db.delete(task).where(inArray(task.id, t.map((x) => x.id)));
  if (m.length) await db.delete(movement).where(inArray(movement.id, m.map((x) => x.id)));
  await db.delete(cases).where(like(cases.number, '99877%'));
  await db.delete(user).where(like(user.email, `${TAG.toLowerCase()}%`));
  await db.delete(appSetting).where(eq(appSetting.key, 'risk_formula'));
}

beforeAll(async () => {
  const { db } = await import('@/db');
  const { user } = await import('@/db/schema');
  const { cases } = await import('@/db/schema/case');
  await limpa();
  const [a] = await db.select().from(user).where(eq(user.role, 'admin')).limit(1);
  adminId = a.id;
  otherId = crypto.randomUUID();
  await db.insert(user).values({ id: otherId, name: `${TAG} outra`, email: `${TAG.toLowerCase()}-o@teste.com`, emailVerified: true, role: 'lawyer', active: true });
  const [c] = await db.insert(cases).values({ number: '99877000000000000001', portfolio: 'civil' }).returning({ id: cases.id });
  caseId = c.id;
});
afterAll(async () => { await limpa(); });

describe('prazo limite e prazo interno', () => {
  it('cria com prazo interno e guarda os dois; interno depois do limite é recusado', async () => {
    const { createTask } = await import('@/server/tasks');
    const ok = await createTask(adminId, form({ title: `${TAG} ok`, caseId, dueDate: '2031-03-20', internalDueDate: '2031-03-18' }));
    expect(ok.ok).toBe(true);
    if (ok.ok) taskIds.push(ok.id);
    const { db } = await import('@/db');
    const { task } = await import('@/db/schema/task');
    const [row] = await db.select().from(task).where(eq(task.id, taskIds[0]));
    expect(row.dueDate).toBe('2031-03-20');
    expect(row.internalDueDate).toBe('2031-03-18');

    const depois = await createTask(adminId, form({ title: `${TAG} depois`, dueDate: '2031-03-20', internalDueDate: '2031-03-25' }));
    expect(depois).toMatchObject({ ok: false, error: 'O prazo interno não pode ser depois do prazo limite.' });
    const semLimite = await createTask(adminId, form({ title: `${TAG} sem limite`, internalDueDate: '2031-03-25' }));
    expect(semLimite.ok).toBe(false);
  });

  it('editar também valida o interno e audita a mudança', async () => {
    const { updateTask } = await import('@/server/task-edit');
    const { db } = await import('@/db');
    const { task } = await import('@/db/schema/task');
    const bad = await updateTask(adminId, taskIds[0], { title: `${TAG} ok`, dueDate: '2031-03-20', internalDueDate: '2031-04-01', typeId: '', dueTime: '', ownerId: '', reviewerId: '' });
    expect(bad.ok).toBe(false);
    const good = await updateTask(adminId, taskIds[0], { title: `${TAG} ok`, dueDate: '2031-03-20', internalDueDate: '2031-03-19', typeId: '', dueTime: '', ownerId: '', reviewerId: '' });
    expect(good).toMatchObject({ ok: true, changed: true });
    const [row] = await db.select().from(task).where(eq(task.id, taskIds[0]));
    expect(row.internalDueDate).toBe('2031-03-19');
  });
});

describe('filtros de responsável e de dia', () => {
  it('filtra por responsável, por "sem responsável" e por dia (limite ou interno)', async () => {
    const { createTask, listTasks, NO_OWNER } = await import('@/server/tasks');
    const a = await createTask(adminId, form({ title: `${TAG} dela`, caseId, dueDate: '2031-05-10', ownerId: otherId }));
    const b = await createTask(adminId, form({ title: `${TAG} ninguem`, caseId, dueDate: '2031-05-12', internalDueDate: '2031-05-10', ownerId: '' }));
    if (a.ok) taskIds.push(a.id);
    if (b.ok) taskIds.push(b.id);
    const base = { userId: adminId, caseId };
    const dela = await listTasks({ ...base, ownerId: otherId });
    expect(dela.map((t) => t.title)).toEqual([`${TAG} dela`]);
    const nenhum = await listTasks({ ...base, ownerId: NO_OWNER });
    expect(nenhum.map((t) => t.title).sort()).toEqual([`${TAG} ninguem`, `${TAG} ok`].sort());
    const dia10 = await listTasks({ ...base, day: '2031-05-10' });
    expect(dia10.map((t) => t.title).sort()).toEqual([`${TAG} dela`, `${TAG} ninguem`].sort()); // um pelo limite, outro pelo interno
    expect(await listTasks({ ...base, day: '2031-05-11' })).toHaveLength(0);
    expect(await listTasks({ ...base, day: 'lixo' })).toHaveLength(3); // dia inválido é ignorado
  });
});

describe('alerta de andamento', () => {
  it('criar tarefa a partir do alerta deixa o alerta como lido; fica pendente até lá', async () => {
    const { db } = await import('@/db');
    const { movement } = await import('@/db/schema/movement');
    const { createTask } = await import('@/server/tasks');
    const { getPendingMovement } = await import('@/server/movements');
    const [m] = await db.insert(movement).values({ caseId, source: 'djen', externalId: `${TAG}-1`, occurredAt: new Date(), title: 'Intimação', rawText: `${TAG} texto`, triageStatus: 'pending' }).returning({ id: movement.id });
    movIds.push(m.id);
    expect((await getPendingMovement(m.id))?.id).toBe(m.id);

    const res = await createTask(adminId, form({ title: `${TAG} do alerta`, caseId, dueDate: '2031-06-10', movementId: m.id }));
    expect(res.ok).toBe(true);
    if (res.ok) taskIds.push(res.id);
    const [after] = await db.select().from(movement).where(eq(movement.id, m.id));
    expect(after.triageStatus).toBe('task_created');
    expect(after.readBy).toBe(adminId);
    expect(after.readAt).not.toBeNull();
    expect(await getPendingMovement(m.id)).toBeNull();
  });

  it('andamento de outro processo é recusado', async () => {
    const { db } = await import('@/db');
    const { cases } = await import('@/db/schema/case');
    const { movement } = await import('@/db/schema/movement');
    const { createTask } = await import('@/server/tasks');
    const [c2] = await db.insert(cases).values({ number: '99877000000000000002', portfolio: 'civil' }).returning({ id: cases.id });
    const [m] = await db.insert(movement).values({ caseId: c2.id, source: 'djen', externalId: `${TAG}-2`, occurredAt: new Date(), title: 'x', rawText: `${TAG} t2`, triageStatus: 'pending' }).returning({ id: movement.id });
    const res = await createTask(adminId, form({ title: `${TAG} errado`, caseId, dueDate: '2031-06-10', movementId: m.id }));
    expect(res.ok).toBe(false);
    const [still] = await db.select().from(movement).where(eq(movement.id, m.id));
    expect(still.triageStatus).toBe('pending');
  });
});

describe('fórmula do valor de risco', () => {
  const input = (o: Partial<{ enabled: boolean; juizado: string; vara: string; antigo: string; honorariosPct: string; oldMonths: string; minimumWage: string; fallbackCap: string }> = {}) => ({
    enabled: o.enabled ?? true, pct: { juizado: o.juizado ?? '18', vara: o.vara ?? '24', antigo: o.antigo ?? '35' },
    honorariosPct: o.honorariosPct ?? '20', oldMonths: o.oldMonths ?? '36', minimumWage: o.minimumWage ?? '', fallbackCap: o.fallbackCap ?? 'none',
  });

  it('desligada não calcula; ligada preenche só o que está em branco, pela categoria do foro, e audita a mudança', async () => {
    const { getRiskFormula, setRiskFormula, withRiskFormula } = await import('@/server/risk');
    const { db } = await import('@/db');
    const { lookup } = await import('@/db/schema/lookups');
    const label = async (l: string) => (await db.select().from(lookup).where(eq(lookup.type, 'court_type'))).find((x) => x.label === l)!.id;
    const juizado = await label('Juizado');
    const vara = await label('Vara Cível');
    const raw = { portfolio: 'civil', courtTypeId: juizado, receivedAt: '', citedAt: '', claimValue: '13.680,00', riskTotal: '' };

    expect((await getRiskFormula()).enabled).toBe(false);
    expect((await withRiskFormula(raw)).riskTotal).toBe('');

    expect((await setRiskFormula(adminId, input())).ok).toBe(true);
    expect((await withRiskFormula(raw)).riskTotal).toBe('19370,88'); // Juizado (planilha)
    expect((await withRiskFormula({ ...raw, courtTypeId: vara, claimValue: '5.000,00' })).riskTotal).toBe('7440,00'); // Vara Cível (planilha)
    const hoje = new Date();
    const velho = new Date(hoje.getTime() - 97 * 30 * 86_400_000).toISOString().slice(0, 10);
    expect((await withRiskFormula({ ...raw, receivedAt: velho, claimValue: '28.625,90' })).riskTotal).toBe('46373,96'); // casos antigos (planilha)
    expect((await withRiskFormula({ ...raw, riskTotal: '123,00' })).riskTotal).toBe('123,00'); // digitado vence
    expect((await withRiskFormula({ ...raw, claimValue: '' })).riskTotal).toBe(''); // sem base e sem teto, nada
    expect((await withRiskFormula({ ...raw, portfolio: 'labor' })).riskTotal).toBe(''); // trabalhista não usa
    expect((await withRiskFormula({ ...raw, courtTypeId: '' })).riskTotal).toBe(''); // foro desconhecido

    const { db: d2 } = await import('@/db');
    const { auditLog } = await import('@/db/schema');
    expect((await d2.select().from(auditLog).where(eq(auditLog.entityId, 'risk_formula'))).length).toBeGreaterThanOrEqual(1);
  });

  it('teto dos juizados quando não há valor da causa; validações do formulário', async () => {
    const { setRiskFormula, withRiskFormula } = await import('@/server/risk');
    const { db } = await import('@/db');
    const { lookup } = await import('@/db/schema/lookups');
    const juizado = (await db.select().from(lookup).where(eq(lookup.type, 'court_type'))).find((x) => x.label === 'Juizado')!.id;
    const raw = { portfolio: 'civil', courtTypeId: juizado, receivedAt: '', citedAt: '', claimValue: '', riskTotal: '' };

    expect(await setRiskFormula(adminId, input({ fallbackCap: 'com' }))).toMatchObject({ ok: false }); // sem salário mínimo
    expect((await setRiskFormula(adminId, input({ fallbackCap: 'com', minimumWage: '1.500,00' }))).ok).toBe(true);
    expect((await withRiskFormula(raw)).riskTotal).toBe('84960,00'); // base 40 x 1.500 = 60.000; +18% = 70.800; +20% de honorários = 84.960
  });

  it('recusa números inválidos', async () => {
    const { setRiskFormula } = await import('@/server/risk');
    expect(await setRiskFormula(adminId, input({ juizado: 'x' }))).toMatchObject({ ok: false });
    expect(await setRiskFormula(adminId, input({ honorariosPct: '-1' }))).toMatchObject({ ok: false });
    expect(await setRiskFormula(adminId, input({ oldMonths: '0' }))).toMatchObject({ ok: false });
    expect(await setRiskFormula(adminId, input({ minimumWage: '-5' }))).toMatchObject({ ok: false });
  });
});

describe('trilha de auditoria por usuário', () => {
  it('filtra pelo usuário, pelo tipo e pela data, e traz o nome', async () => {
    const { audit } = await import('@/lib/audit');
    const { listAudit, auditSummaryByUser } = await import('@/server/audit-log');
    await audit({ actorId: otherId, entity: 'task', entityId: `${TAG}-x1`, action: 'create', diff: { after: { a: 1 } } });
    await audit({ actorId: otherId, entity: 'case', entityId: `${TAG}-x2`, action: 'update', diff: { b: 2 } });
    await audit({ actorId: null, entity: 'case', entityId: `${TAG}-x3`, action: 'update' });

    const dela = await listAudit({ userId: otherId });
    expect(dela.total).toBe(2);
    expect(dela.rows.every((r) => r.actorName === `${TAG} outra`)).toBe(true);
    expect((await listAudit({ userId: otherId, entity: 'task' })).total).toBe(1);
    expect((await listAudit({ userId: otherId, action: 'update' })).total).toBe(1);
    const hoje = new Date().toISOString().slice(0, 10);
    expect((await listAudit({ userId: otherId, from: hoje, to: hoje })).total).toBe(2);
    expect((await listAudit({ userId: otherId, from: '2000-01-01', to: '2000-01-02' })).total).toBe(0);
    expect((await listAudit({ userId: 'system' })).rows.some((r) => r.entityId === `${TAG}-x3`)).toBe(true);

    const resumo = await auditSummaryByUser({});
    expect(resumo.find((s) => s.actorId === otherId)?.n).toBe(2);

    const { db } = await import('@/db');
    const { auditLog } = await import('@/db/schema');
    await db.delete(auditLog).where(inArray(auditLog.entityId, [`${TAG}-x1`, `${TAG}-x2`, `${TAG}-x3`]));
  });
});
