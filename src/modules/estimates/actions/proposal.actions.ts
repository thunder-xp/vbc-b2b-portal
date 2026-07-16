"use server";

import { revalidatePath } from "next/cache";

import { type ActionResult, failureFromError, success } from "../../access-control/actions/action-result";
import type { GeneratedEstimateDocument, ProposalSettings } from "../types";
import type { ProposalPreviewDto, VersionProposalPreviewDto } from "../services";
import { createProposalService, getAuthenticatedUserId } from "./service-factory";

export async function getEstimateProposalPreviewAction(estimateId: string): Promise<ActionResult<ProposalPreviewDto>> {
  try { const userId = await getAuthenticatedUserId(); return success("Предложение подготовлено.", await createProposalService().preparePreview(userId, estimateId)); }
  catch (error) { return failureFromError(error); }
}

export async function saveEstimateProposalSettingsAction(estimateId: string, input: { expectedRevision: number; templateId: string | null; settings: ProposalSettings }): Promise<ActionResult<{ revision: number }>> {
  try {
    const userId = await getAuthenticatedUserId();
    const result = await createProposalService().saveSettings(userId, estimateId, input.expectedRevision, input.templateId, input.settings);
    revalidatePath(`/cabinet/estimates/${estimateId}/preview`);
    return success("Настройки предложения сохранены.", result);
  } catch (error) { return failureFromError(error); }
}

export async function generateEstimateProposalPdfAction(estimateId: string): Promise<ActionResult<GeneratedEstimateDocument>> {
  try { const userId = await getAuthenticatedUserId(); return success("PDF сформирован.", await createProposalService().generatePdf(userId, estimateId)); }
  catch (error) { return failureFromError(error); }
}

export async function copyEstimateProposalTemplateAction(sourceTemplateId: string, name: string) {
  try { const userId = await getAuthenticatedUserId(); return success("Копия шаблона создана.", await createProposalService().copyTemplate(userId, sourceTemplateId, name)); }
  catch (error) { return failureFromError(error); }
}

export async function getEstimateVersionProposalPreviewAction(versionId: string): Promise<ActionResult<VersionProposalPreviewDto>> {
  try { return success("Версия предложения подготовлена.", await createProposalService().prepareVersionPreview(await getAuthenticatedUserId(), versionId)); }
  catch (error) { return failureFromError(error); }
}

export async function generateEstimateVersionPdfAction(versionId: string): Promise<ActionResult<GeneratedEstimateDocument>> {
  try {
    const result = await createProposalService().generateVersionPdf(await getAuthenticatedUserId(), versionId);
    revalidatePath(`/cabinet/estimates/${result.estimateId}`);
    return success("PDF версии сформирован.", result);
  }
  catch (error) { return failureFromError(error); }
}
