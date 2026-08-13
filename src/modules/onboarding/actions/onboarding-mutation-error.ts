import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

export const ONBOARDING_MUTATION_ERROR_CODES = [
  "ONBOARDING_DRAFT_VERSION_CONFLICT",
  "ONBOARDING_MANAGER_INVALID",
  "ONBOARDING_PARTNER_STATUS_INVALID",
  "ONBOARDING_PRICE_TYPE_REQUIRED",
  "ONBOARDING_COMMERCIAL_VALIDATION_FAILED",
  "ONBOARDING_COMMERCIAL_PERSISTENCE_FAILED",
  "ONBOARDING_STATE_TRANSITION_FAILED",
  "ONBOARDING_INFRASTRUCTURE_FAILURE",
  "unknown_retryable",
] as const;

export type OnboardingMutationErrorCode =
  (typeof ONBOARDING_MUTATION_ERROR_CODES)[number];

export type OnboardingMutationContext = {
  correlationId: string;
  accessRequestId: string | null;
  approvalDraftId: string | null;
  currentWizardStep: number | null;
  attemptedNextStep: number | null;
  mutationActionName: string;
  rpcFunctionName: string | null;
  draftVersion: number | null;
  expectedVersion: number | null;
  selectedManagerId: string | null;
  selectedPartnerStatus: string | null;
  selectedPriceTypeReference: string | null;
  paymentModel: string | null;
  ordersEnabled: boolean | null;
  financeEnabled: boolean | null;
};

type DatabaseErrorShape = {
  code?: unknown;
  constraint?: unknown;
  details?: unknown;
  hint?: unknown;
  message?: unknown;
};

export type OnboardingMutationDiagnostic = OnboardingMutationContext & {
  reason: OnboardingMutationErrorCode;
  errorClass: string;
  errorName: string | null;
  originalMessage: string | null;
  sqlState: string | null;
  databaseDetails: string | null;
  databaseHint: string | null;
  failingConstraint: string | null;
  stack: string | null;
  elapsedMs: number;
};

export function diagnoseOnboardingMutationError(
  error: unknown,
  context: OnboardingMutationContext,
  elapsedMs: number,
): OnboardingMutationDiagnostic {
  const databaseError = findDatabaseError(error);
  const originalMessage = safeDiagnosticText(
    databaseError?.message ?? (error instanceof Error ? error.message : null),
  );
  const sqlState = safeSqlState(databaseError?.code);
  const reason = error instanceof Error && error.name === "ZodError"
    ? "ONBOARDING_COMMERCIAL_VALIDATION_FAILED"
    : classifyOnboardingMutationError(originalMessage, sqlState);

  return {
    ...context,
    reason,
    errorClass: errorClass(error),
    errorName: error instanceof Error ? error.name : null,
    originalMessage,
    sqlState,
    databaseDetails: safeDatabaseDetail(databaseError?.details),
    databaseHint: safeDiagnosticText(databaseError?.hint),
    failingConstraint: extractConstraint(databaseError),
    stack: safeStack(error),
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
  };
}

export function classifyOnboardingMutationError(
  message: string | null,
  sqlState: string | null,
): OnboardingMutationErrorCode {
  const normalized = message?.toLowerCase() ?? "";

  if (normalized.includes("stale_approval_draft") || normalized.includes("stale_request_revision") || sqlState === "PT409") {
    return "ONBOARDING_DRAFT_VERSION_CONFLICT";
  }
  if (normalized.includes("onboarding_manager_invalid") || normalized.includes("permission_denied")) {
    return "ONBOARDING_MANAGER_INVALID";
  }
  if (normalized.includes("onboarding_price_type_required")) {
    return "ONBOARDING_PRICE_TYPE_REQUIRED";
  }
  if (normalized.includes("invalid_price_profile") || normalized.includes("onboarding_partner_status_invalid")) {
    return "ONBOARDING_PARTNER_STATUS_INVALID";
  }
  if (normalized.includes("onboarding_commercial_validation_failed") || sqlState === "22023") {
    return "ONBOARDING_COMMERCIAL_VALIDATION_FAILED";
  }
  if (normalized.includes("invalid_status_transition") || sqlState === "55000") {
    return "ONBOARDING_STATE_TRANSITION_FAILED";
  }
  if (sqlState === "42702" || sqlState?.startsWith("23")) {
    return "ONBOARDING_COMMERCIAL_PERSISTENCE_FAILED";
  }
  if (sqlState?.startsWith("08") || sqlState?.startsWith("53") || sqlState?.startsWith("57")) {
    return "ONBOARDING_INFRASTRUCTURE_FAILURE";
  }
  return "unknown_retryable";
}

function findDatabaseError(error: unknown): DatabaseErrorShape | null {
  let current = error;
  const visited = new Set<unknown>();

  for (let depth = 0; depth < 5 && current && !visited.has(current); depth += 1) {
    visited.add(current);
    if (isDatabaseError(current)) return current;
    current = current instanceof RepositoryUnexpectedError
      ? current.cause
      : current instanceof Error
        ? (current as Error & { cause?: unknown }).cause
        : null;
  }
  return null;
}

function isDatabaseError(value: unknown): value is DatabaseErrorShape {
  return typeof value === "object"
    && value !== null
    && ("code" in value || "details" in value || "hint" in value);
}

function safeSqlState(value: unknown): string | null {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[0-9A-Z]{5}$/.test(code) ? code : null;
}

function safeDiagnosticText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const sanitized = value
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[REDACTED_EMAIL]")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  return sanitized ? sanitized.slice(0, 800) : null;
}

function safeDatabaseDetail(value: unknown): string | null {
  const detail = safeDiagnosticText(value);
  if (!detail || /failing row contains/i.test(detail)) return null;
  return detail;
}

function extractConstraint(error: DatabaseErrorShape | null): string | null {
  if (!error) return null;
  if (typeof error.constraint === "string" && /^[A-Za-z0-9_]{1,128}$/.test(error.constraint)) {
    return error.constraint;
  }
  const detail = typeof error.details === "string" ? error.details : "";
  const match = detail.match(/constraint ["']([A-Za-z0-9_]+)["']/i);
  return match?.[1] ?? null;
}

function errorClass(error: unknown): string {
  if (error && typeof error === "object" && "constructor" in error) {
    const name = (error as { constructor?: { name?: unknown } }).constructor?.name;
    if (typeof name === "string" && name) return name;
  }
  return typeof error;
}

function safeStack(error: unknown): string | null {
  if (!(error instanceof Error) || !error.stack) return null;
  return safeDiagnosticText(error.stack.split("\n").slice(0, 10).join("\n"));
}
