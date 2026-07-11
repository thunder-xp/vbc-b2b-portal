import { z } from "zod";

export const ONE_C_ZERO_GUID = "00000000-0000-0000-0000-000000000000";

export const oneCGuidSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "Invalid 1C GUID",
  );

export function parseOneCGuid(value: unknown): string | null {
  const result = oneCGuidSchema.safeParse(value);
  return result.success ? result.data.toLowerCase() : null;
}

export function parseRequiredOneCGuid(value: unknown): string | null {
  const guid = parseOneCGuid(value);
  return guid && guid !== ONE_C_ZERO_GUID ? guid : null;
}

export function parseOptionalOneCGuid(value: unknown): string | null {
  const guid = parseOneCGuid(value);
  return guid && guid !== ONE_C_ZERO_GUID ? guid : null;
}

export function isOneCGuid(value: unknown): boolean {
  return parseOneCGuid(value) !== null;
}
