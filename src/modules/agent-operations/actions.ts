"use server";

import { revalidatePath } from "next/cache";
import { requireAdminPermission } from "@/src/modules/admin";
import { getOneCSafeDiagnostic } from "@/src/modules/integration/providers/one-c/one-c-safe-diagnostic";
import { createAgentOperationsService } from "./factory";
import type { AgentContractCandidate, AgentProjectCandidate } from "./types";

export type AgentOperationResult<T = undefined> = { ok: true; data: T; message: string } | { ok: false; code: string; message: string };

export async function verifyAgentCounterpartyAction(agentId: string): Promise<AgentOperationResult> {
  return run(agentId, "VERIFY_COUNTERPARTY", async (actor) => { await createAgentOperationsService().verifyCounterparty(agentId, actor); return undefined; }, "Контрагент и код агента проверены по 1С.");
}
export async function bindAgentCounterpartyAction(agentId: string, reference: string): Promise<AgentOperationResult> {
  return run(agentId, "BIND_COUNTERPARTY", async (actor) => { await createAgentOperationsService().bindCounterparty(agentId, reference, actor); return undefined; }, "Контрагент связан и проверен.");
}
export async function discoverAgentContractsAction(agentId: string): Promise<AgentOperationResult<AgentContractCandidate[]>> {
  return run(agentId, "DISCOVER_CONTRACTS", () => createAgentOperationsService().contractCandidates(agentId), "Найдены договоры точного контрагента.");
}
export async function bindAgentContractAction(agentId: string, reference: string, reason: string | null): Promise<AgentOperationResult> {
  return run(agentId, "BIND_CONTRACT", async (actor) => { await createAgentOperationsService().bindContract(agentId, reference, actor, reason); return undefined; }, "Договор связан и проверен.");
}
export async function discoverAgentProjectsAction(agentId: string): Promise<AgentOperationResult<AgentProjectCandidate[]>> {
  return run(agentId, "DISCOVER_PROJECTS", () => createAgentOperationsService().projectCandidates(agentId), "Найдены проекты с точными связями контрагента и договора.");
}
export async function bindAgentProjectAction(agentId: string, reference: string, reason: string | null): Promise<AgentOperationResult> {
  return run(agentId, "BIND_PROJECT", async (actor) => { await createAgentOperationsService().bindProject(agentId, reference, actor, reason); return undefined; }, "Проект связан и проверен.");
}
export async function requestAgentPasswordResetAction(agentId: string): Promise<AgentOperationResult> {
  return run(agentId, "REQUEST_PASSWORD_RESET", async (actor) => { await createAgentOperationsService().requestPasswordReset(agentId, actor); return undefined; }, "Ссылка для смены пароля отправлена.");
}

async function run<T>(agentId: string, operationName: string, operation: (actorUserId: string) => Promise<T>, success: string): Promise<AgentOperationResult<T>> {
  const context = await requireAdminPermission("admin.agents.manage");
  try {
    const data = await operation(context.userId);
    revalidatePath("/admin/agents"); revalidatePath(`/admin/agents/${agentId}`);
    return { ok: true, data, message: success };
  } catch (error) {
    const code = safeCode(error);
    console.error({
      event: "agent_admin_operation_failed",
      operation: operationName,
      code,
      diagnostic: getOneCSafeDiagnostic(error),
    });
    return { ok: false, code, message: message(code) };
  }
}
function safeCode(error: unknown) {
  const raw = error instanceof Error ? error.message.split(":", 1)[0] : "OPERATION_FAILED";
  if (/^[A-Z0-9_]{3,80}$/.test(raw)) return raw;
  const byName: Record<string, string> = {
    IntegrationForbiddenError: "ONEC_FORBIDDEN",
    IntegrationProviderUnavailableError: "ONEC_UNAVAILABLE",
    IntegrationTimeoutError: "ONEC_TIMEOUT",
    IntegrationUnauthorizedError: "ONEC_UNAUTHORIZED",
    OneCODataFilterUnsupportedError: "ONEC_ODATA_REJECTED",
    OneCODataHttpError: "ONEC_ODATA_REJECTED",
    OneCODataProviderError: "ONEC_ODATA_REJECTED",
    OneCODataResponseValidationError: "ONEC_RESPONSE_INVALID",
  };
  return error instanceof Error ? byName[error.name] ?? "OPERATION_FAILED" : "OPERATION_FAILED";
}
function message(code: string) {
  const messages: Record<string, string> = {
    COUNTERPARTY_NOT_BOUND: "Сначала свяжите контрагента 1С.", COUNTERPARTY_ALREADY_BOUND: "Контрагент уже связан; для исправления требуется отдельная сверка.",
    MISSING_AGENT_CODE: "В 1С отсутствует точный NSD код агента.", AGENT_CODE_MISMATCH: "NSD код агента в 1С не совпадает с порталом.",
    ONEC_ENTITY_INACTIVE: "Объект 1С неактивен или помечен на удаление.", VERIFIED_CONTRACT_REQUIRED: "Сначала свяжите и проверьте договор.",
    PROJECT_AGENT_CODE_NOT_PROVEN: "Проект не содержит доказанного кода агента.", AGENT_AUTH_NOT_LINKED: "Auth-учётная запись не связана.",
    AGENT_AUTH_EMAIL_NOT_READY: "Подтверждённый email Auth недоступен.", PASSWORD_RECOVERY_SEND_FAILED: "Supabase не принял запрос восстановления пароля.",
  };
  return messages[code] ?? "Операция не выполнена. Состояние не изменено.";
}
