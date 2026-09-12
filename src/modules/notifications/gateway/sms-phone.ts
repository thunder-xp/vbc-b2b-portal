export function normalizeE164Phone(value: string): string | null {
  const normalized = value.trim().replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export function toMoldcellRecipient(value: string): string | null {
  return normalizeE164Phone(value)?.slice(1) ?? null;
}

export function maskPhone(value: string): string {
  const normalized = normalizeE164Phone(value);
  if (!normalized) return "INVALID";
  const visiblePrefix = normalized.slice(0, Math.min(4, normalized.length - 4));
  return `${visiblePrefix}${"*".repeat(Math.max(4, normalized.length - visiblePrefix.length - 3))}${normalized.slice(-3)}`;
}
