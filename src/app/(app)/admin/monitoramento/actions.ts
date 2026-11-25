'use server';

import { revalidatePath } from 'next/cache';
import type { ActionState } from '@/components/action-form';
import { requireAdmin } from '@/lib/auth/session';
import { CONNECTORS, runConnector } from '@/lib/connectors/runner';
import {
  addEntity, addTerm, deleteEntity, deleteTerm, setEntityActive, setTermActive, updateEntity, updateTerm,
} from '@/server/monitoring';
import { addNameVariants, decideVariation } from '@/server/name-variations';
import { setDjenIntervalHours } from '@/server/settings';
import { isAllowedHours, windowStartForHours } from '@/lib/connectors/window';
import { dispatchMany, dispatchTermSearch } from './dispatch';

const refresh = () => revalidatePath('/admin/monitoramento');
const txt = (fd: FormData, k: string) => String(fd.get(k) ?? '');
const hoursOf = (fd: FormData) => {
  const h = Number(txt(fd, 'horas'));
  return isAllowedHours(h) ? h : undefined;
};

/**
 * RF-66: o admin gerencia os termos monitorados no DJEN sem mexer no código.
 * Termo novo (ou variação) dispara a busca na hora, em segundo plano, sem esperar a consulta diária.
 */
export async function addTermAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  const r = await addTerm(s.user.id, { kind: txt(fd, 'kind'), term: txt(fd, 'term'), document: txt(fd, 'document') });
  if (!r.ok) return { error: r.error };
  const ids = [r.id];
  let extra = '';
  const outras = txt(fd, 'variants').trim(); // outras grafias da empresa (uma por linha), com o mesmo CNPJ de conferência
  if (outras && txt(fd, 'kind') === 'name') {
    const v = await addNameVariants(s.user.id, outras, txt(fd, 'document'));
    ids.push(...v.ids);
    extra = ` ${v.added} variação(ões) adicionada(s).${v.errors.length ? ` Com erro: ${v.errors.join('; ')}` : ''}`;
  }
  await dispatchMany(ids, hoursOf(fd));
  refresh();
  return { message: `Termo adicionado.${extra} A busca das últimas 24 horas já começou em segundo plano (acompanhe em "Última busca"). Use "Buscar de novo" para escolher 1, 6, 12 ou 24 horas.` };
}

/** Editar o texto do termo equivale a um termo novo: busca de novo (se estiver ativo). */
export async function updateTermAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  const id = txt(fd, 'id');
  const r = await updateTerm(s.user.id, id, { term: txt(fd, 'term'), document: txt(fd, 'document') });
  if (!r.ok) return { error: r.error };
  await dispatchTermSearch(id);
  refresh();
  return { message: 'Termo atualizado e busca reiniciada em segundo plano.' };
}

/** Ativar (ou reativar) um termo dispara a busca; desativar só pausa. */
export async function toggleTermAction(fd: FormData) {
  const s = await requireAdmin();
  const id = txt(fd, 'id');
  const active = fd.get('active') === 'true';
  await setTermActive(s.user.id, id, active);
  if (active) await dispatchTermSearch(id);
  refresh();
}

/** "Buscar de novo" um termo, escolhendo o período em horas (1, 6, 12 ou 24). */
export async function searchTermNowAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  await dispatchTermSearch(txt(fd, 'id'), hoursOf(fd));
  refresh();
  return { message: 'Busca iniciada em segundo plano.' };
}

export async function deleteTermAction(fd: FormData) {
  const s = await requireAdmin();
  await deleteTerm(s.user.id, txt(fd, 'id'));
  refresh();
}

/** Loja nova ou empresa nova do grupo. Empresa de raiz de CNPJ nova ganha também a busca por nome (já disparada). */
export async function addEntityAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  const r = await addEntity(s.user.id, { cnpj: txt(fd, 'cnpj'), label: txt(fd, 'label'), companyName: txt(fd, 'companyName') });
  if (!r.ok) return { error: r.error };
  if (r.termId) await dispatchTermSearch(r.termId);
  refresh();
  return { message: r.createdTerm ? 'Cadastrado, e a busca pelo nome da empresa foi criada e já começou.' : 'Loja cadastrada. A empresa já é monitorada pelo nome, nada mais a fazer.' };
}

export async function updateEntityAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  const r = await updateEntity(s.user.id, txt(fd, 'id'), { label: txt(fd, 'label') });
  if (!r.ok) return { error: r.error };
  refresh();
  return { message: 'Atualizado.' };
}

export async function toggleEntityAction(fd: FormData) {
  const s = await requireAdmin();
  await setEntityActive(s.user.id, txt(fd, 'id'), fd.get('active') === 'true');
  refresh();
}

export async function deleteEntityAction(fd: FormData) {
  const s = await requireAdmin();
  await deleteEntity(s.user.id, txt(fd, 'id'));
  refresh();
}

/** Decide se uma grafia de nome vista nas publicações é a Foco (vira termo e já busca) ou um homônimo (sai das próximas buscas). */
export async function decideVariationAction(fd: FormData) {
  const s = await requireAdmin();
  const r = await decideVariation(s.user.id, txt(fd, 'name'), txt(fd, 'decision') === 'approved' ? 'approved' : 'rejected');
  if (r.ok && r.termId) await dispatchTermSearch(r.termId);
  refresh();
  revalidatePath('/caixa-entrada');
}

/** "Rodar agora": roda TODOS os termos; vazio = janela diária normal; ou as últimas 1, 6, 12 ou 24 horas. */
export async function runConnectorAction(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireAdmin();
  const name = txt(fd, 'name') as keyof typeof CONNECTORS;
  const c = CONNECTORS[name];
  if (!c) return { error: 'Conector inválido.' };
  const h = hoursOf(fd);
  const r = await runConnector(c, { since: h ? windowStartForHours(h, new Date()) : undefined });
  refresh();
  if (r.status === 'not_configured') return { error: r.reason };
  if (r.status === 'error') return { error: r.error };
  return { message: `${r.found} itens lidos, ${r.created} novos.` };
}

/** De quantas em quantas horas a consulta automática do DJEN roda. O worker reagenda sozinho em até 1 minuto. */
export async function setIntervalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireAdmin();
  const r = await setDjenIntervalHours(s.user.id, Number(txt(fd, 'horas')));
  if (!r.ok) return { error: r.error };
  refresh();
  return { message: 'Intervalo salvo. O worker passa a usar em até 1 minuto, sem reiniciar.' };
}
