import "server-only";

export type ExternalEmailBlockReason = "GLOBAL_KILL_SWITCH" | "EMAIL_KILL_SWITCH";

export function externalEmailBlockReason(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ExternalEmailBlockReason | null {
  if (environment.COMMUNICATION_OUTBOUND_KILL_SWITCH === "ON") return "GLOBAL_KILL_SWITCH";
  if (environment.COMMUNICATION_EMAIL_KILL_SWITCH === "ON") return "EMAIL_KILL_SWITCH";
  return null;
}
