export type DirectReplacementInput = {
  productCode: string;
  shippedAt: Date | null;
  warrantyState: "eligible" | "expired" | "verification_required" | "excluded_by_policy";
  hardwareFaultConfirmed: boolean;
};

const ELIGIBLE_PRODUCT_CODE = /^(IPC[12]\d{3}|WIFI-CAM|CMC-POE-(?:0?[1-9]|1[0-6])|DESKTOP-POE)(?:[-_/]|$)/i;

export function evaluateDahuaDirectReplacement(input: DirectReplacementInput):
  "not_evaluated" | "possible_candidate" | "eligible_after_diagnosis" | "not_eligible" {
  if (!ELIGIBLE_PRODUCT_CODE.test(input.productCode.trim())) return "not_eligible";
  if (!input.shippedAt || input.shippedAt < new Date("2026-01-01T00:00:00+02:00")) return "not_eligible";
  if (input.warrantyState !== "eligible") return input.warrantyState === "verification_required" ? "possible_candidate" : "not_eligible";
  return input.hardwareFaultConfirmed ? "eligible_after_diagnosis" : "possible_candidate";
}
