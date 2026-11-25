'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { ActionState } from '@/components/action-form';
import { requireAdmin, requireRole } from '@/lib/auth/session';
import {
  caseFormSchema, closeCase, createCase, reopenCase, reviewRisk, setMonitoring, softDeleteCase, updateCaseData,
} from '@/server/cases';
import { withRiskFormula } from '@/server/risk';
import { cancelOpenTasksOfCase, openTasksOfCase } from '@/server/tasks';
import { addParty, addRental, removeParty, removeRental, updateRootCause } from '@/server/case-details';

export type CaseFormState = { error?: string; fields?: Record<string, string>; values?: Record<string, string> } | undefined;

const str = (fd: FormData) => Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));

export async function createCaseAction(_: CaseFormState, formData: FormData): Promise<CaseFormState> {
  const session = await requireRole('admin', 'lawyer');
  const input = await withRiskFormula(str(formData));
  const parsed = caseFormSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[String(i.path[0])] = i.message;
    return { error: parsed.error.issues[0].message, fields, values: input };
  }
  const res = await createCase(session.user.id, parsed.data);
  if (!res.ok) return { error: res.error, values: str(formData) };
  redirect(`/processos/${res.id}`);
}

export async function updateCaseAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireRole('admin', 'lawyer');
  const id = String(formData.get('id'));
  const res = await updateCaseData(session.user.id, id, str(formData));
  if (!res.ok) return { error: res.error };
  revalidatePath(`/processos/${id}`);
  return { message: 'Alterações salvas.' };
}

export async function reviewRiskAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireRole('admin', 'lawyer');
  const id = String(formData.get('id'));
  const s = await withRiskFormula(str(formData), { caseId: id });
  const res = await reviewRisk(session.user.id, id, {
    prognosis: s.prognosis, riskTotal: s.riskTotal, riskMaterial: s.riskMaterial,
    riskMoral: s.riskMoral, claimValue: s.claimValue, settlementLimit: s.settlementLimit,
  });
  if (!res.ok) return { error: res.error };
  revalidatePath(`/processos/${id}`);
  return { message: 'Revisão registrada.' };
}

export async function rootCauseAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireRole('admin', 'lawyer');
  const id = String(formData.get('id'));
  const s = str(formData);
  const res = await updateRootCause(session.user.id, id, { avoidable: s.avoidable, rootCauseArea: s.rootCauseArea, rootCause: s.rootCause });
  if (!res.ok) return { error: res.error };
  revalidatePath(`/processos/${id}`);
  return { message: 'Causa raiz salva.' };
}

export async function addPartyAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireRole('admin', 'lawyer');
  const id = String(formData.get('id'));
  const s = str(formData);
  const res = await addParty(session.user.id, id, { role: s.role, name: s.name, document: s.document, lawyerName: s.lawyerName });
  if (!res.ok) return { error: res.error };
  revalidatePath(`/processos/${id}`);
  return { message: 'Parte adicionada.' };
}

export async function removePartyAction(formData: FormData) {
  const session = await requireRole('admin', 'lawyer');
  const id = String(formData.get('id'));
  await removeParty(session.user.id, id, String(formData.get('partyId')));
  revalidatePath(`/processos/${id}`);
}

export async function addRentalAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireRole('admin', 'lawyer');
  const id = String(formData.get('id'));
  const s = str(formData);
  const res = await addRental(session.user.id, id, {
    contractCode: s.contractCode, store: s.store, plate: s.plate, vehicleModel: s.vehicleModel, rentalType: s.rentalType,
  });
  if (!res.ok) return { error: res.error };
  revalidatePath(`/processos/${id}`);
  return { message: 'Contrato vinculado.' };
}

export async function removeRentalAction(formData: FormData) {
  const session = await requireRole('admin', 'lawyer');
  const id = String(formData.get('id'));
  await removeRental(session.user.id, id, String(formData.get('rentalId')));
  revalidatePath(`/processos/${id}`);
}

export async function closeCaseAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireRole('admin', 'lawyer');
  const id = String(formData.get('id'));
  // RF-47: tarefas abertas exigem decisão (cancelar ou manter)
  const open = await openTasksOfCase(id);
  const decision = String(formData.get('openTasks') ?? '');
  if (open.length > 0 && decision !== 'cancel' && decision !== 'keep') {
    return { error: `Há ${open.length} tarefa(s) aberta(s): escolha cancelar ou manter.` };
  }
  const res = await closeCase(session.user.id, id, String(formData.get('closingReasonId') ?? ''), String(formData.get('closedAt') ?? ''));
  if (!res.ok) return { error: res.error };
  if (open.length > 0 && decision === 'cancel') await cancelOpenTasksOfCase(session.user.id, id);
  revalidatePath(`/processos/${id}`);
  return { message: 'Processo encerrado.' };
}

export async function reopenCaseAction(formData: FormData) {
  const session = await requireRole('admin', 'lawyer');
  const id = String(formData.get('id'));
  await reopenCase(session.user.id, id);
  revalidatePath(`/processos/${id}`);
}

export async function monitoringAction(formData: FormData) {
  const session = await requireRole('admin', 'lawyer');
  const id = String(formData.get('id'));
  await setMonitoring(session.user.id, id, formData.get('on') === 'true');
  revalidatePath(`/processos/${id}`);
}

export async function deleteCaseAction(formData: FormData) {
  const session = await requireAdmin();
  await softDeleteCase(session.user.id, String(formData.get('id')));
  redirect('/processos');
}
