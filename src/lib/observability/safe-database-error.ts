export type SafeDatabaseError = {
  code: string | null;
  constraint: string | null;
  details: string | null;
  hint: string | null;
  message: string | null;
};

export function getSafeDatabaseError(error: unknown): SafeDatabaseError {
  const value = isRecord(error) ? error : {};
  const message = safeText(value.message);
  return {
    code: safeText(value.code, 40),
    constraint: safeText(value.constraint, 100) ?? extractConstraint(message),
    details: safeText(value.details),
    hint: safeText(value.hint),
    message,
  };
}

function extractConstraint(message: string | null): string | null {
  return message?.match(/constraint\s+["']?([a-z0-9_]+)["']?/i)?.[1] ?? null;
}

function safeText(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\r\n\t]+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
