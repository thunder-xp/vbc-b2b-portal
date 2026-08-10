"use server";

import { revalidatePath } from "next/cache";

import { failureFromError, invalidInput, success } from "../../access-control/actions/action-result";
import { requireAdminPermission } from "../../admin/services";
import type { CctvCalculatorInput, GeneratorRequirement } from "../services";
import { createProposalGeneratorService, getAuthenticatedUserId } from "./service-factory";

export async function generateProposalDraftAction(input: { requirement: string; requestKey: string }) {
  if (input.requirement.trim().length < 10) return invalidInput("Опишите задачу подробнее.");
  try {
    const userId = await getAuthenticatedUserId();
    return success("Черновая структура сформирована. Проверьте позиции и выберите точные соответствия.", await createProposalGeneratorService().generate(userId, input));
  } catch (error) {
    console.error({ event: "estimate_generator_failed", errorName: error instanceof Error ? error.name : typeof error });
    return failureFromError(error);
  }
}

export async function calculateQuickProposalAction(input: { parameters: CctvCalculatorInput; currencyCode: string; requestKey: string }) {
  try {
    const userId = await getAuthenticatedUserId();
    return success("Ориентировочный расчёт сформирован. Проверьте позиции и соответствия.", await createProposalGeneratorService().calculateCctv(userId, input));
  } catch (error) {
    console.error({ event: "estimate_generator_quick_calculation_failed", errorName: error instanceof Error ? error.name : typeof error });
    return failureFromError(error);
  }
}

export async function createGeneratedEstimateAction(input: {
  sessionId: string; sessionFingerprint: string; finalCustomerId: string; name: string; projectName?: string | null;
  currencyCode: string; validityDays: number; requestKey: string; requirements: GeneratorRequirement[];
}) {
  try {
    const userId = await getAuthenticatedUserId();
    const result = await createProposalGeneratorService().createEstimate(userId, input);
    revalidatePath("/cabinet/estimates");
    return success("Смета создана.", result);
  } catch (error) { return failureFromError(error); }
}

export async function submitProposalGeneratorFeedbackAction(input: { sessionId: string; answer: "yes" | "partial" | "no"; comment?: string | null }) {
  try {
    const userId = await getAuthenticatedUserId();
    const id = await createProposalGeneratorService().submitFeedback(userId, input);
    return success("Спасибо за обратную связь.", { id });
  } catch (error) { return failureFromError(error); }
}

export async function canPromptProposalGeneratorFeedbackAction(sessionId: string, estimateId: string) {
  try { const userId = await getAuthenticatedUserId(); return await createProposalGeneratorService().canPromptFeedback(userId, sessionId, estimateId); }
  catch { return false; }
}

export async function getProposalGeneratorAdminReportAction() {
  try {
    await requireAdminPermission("admin.estimates.view");
    return success("Метрики генератора загружены.", await createProposalGeneratorService().getAdminReport());
  } catch (error) { return failureFromError(error); }
}

export async function listProposalGeneratorProfilesAction() {
  try {
    await requireAdminPermission("admin.estimates.view");
    return success("Профили загружены.", await createProposalGeneratorService().listCalculatorProfiles());
  } catch (error) { return failureFromError(error); }
}

export async function searchProposalGeneratorTargetsAction(query: string) {
  try {
    await requireAdminPermission("admin.integrations.manage");
    return success("Соответствия найдены.", await createProposalGeneratorService().searchCalculatorTargets(query));
  } catch (error) { return failureFromError(error); }
}

export async function updateProposalGeneratorProfileAction(input: { profileKey: string; expectedVersion: number; targetType: "catalog" | "external_nomenclature" | "unresolved"; targetId: string | null }) {
  try {
    await requireAdminPermission("admin.integrations.manage");
    const version = await createProposalGeneratorService().updateCalculatorProfile(input);
    revalidatePath("/admin/commercial/proposal-generator");
    return success("Соответствие сохранено.", { version });
  } catch (error) { return failureFromError(error); }
}
