import type { CctvObjectType } from "../../cctv-calculation";
import type { SupabaseCctvObjectConfigurationRepository } from "../../cctv-calculation/cctv-object-configuration.repository";
import type { InstallationPricingResult, InstallationServiceType, InstallationUnitCode } from "../types";

export class CctvObjectServicePricingService {
  constructor(private readonly repository: Pick<SupabaseCctvObjectConfigurationRepository, "resolve">) {}

  async price(objectType: CctvObjectType, requirements: Array<{
    serviceType: InstallationServiceType;
    quantity: number;
    unitCode: InstallationUnitCode;
  }>): Promise<InstallationPricingResult> {
    if (!requirements.length) return emptyResult();
    const supported = requirements.flatMap((item) => isCalculatorService(item.serviceType) ? [{ ...item, serviceType: item.serviceType }] : []);
    const resolved = await this.repository.resolve(objectType, supported.map((item) => item.serviceType));
    const byType = new Map(resolved.map((item) => [item.requestServiceType, item]));
    const missing = supported.filter((item) => {
      const match = byType.get(item.serviceType);
      return !match?.serviceCode || match.unitCode !== item.unitCode || match.unitPrice == null || !match.currency || !match.tariffSetId;
    }).map((item) => item.serviceType);
    if (missing.length || supported.length !== requirements.length) {
      const evidence = resolved.find((item) => item.tariffSetId && item.currency);
      return { ...emptyResult(), complete: false, tariffSetId: evidence?.tariffSetId ?? null,
        tariffVersion: evidence?.tariffVersion ?? null, currency: evidence?.currency ?? null,
        vatTreatment: evidence?.vatTreatment ?? null,
        missing: [...new Set([...missing, ...requirements.filter((item) => !isCalculatorService(item.serviceType)).map((item) => item.serviceType)])] };
    }
    const first = byType.get(supported[0].serviceType)!;
    const lines = supported.map((item) => {
      const match = byType.get(item.serviceType)!;
      return { ...item, unitPrice: match.unitPrice!, amount: money(item.quantity * match.unitPrice!) };
    });
    return {
      complete: true, tariffSetId: first.tariffSetId, tariffVersion: first.tariffVersion,
      currency: first.currency, vatTreatment: first.vatTreatment, lines,
      subtotal: money(lines.reduce((sum, line) => sum + line.amount, 0)), missing: [],
    };
  }
}

function isCalculatorService(value: InstallationServiceType): value is "camera_installation" | "cable_laying" | "commissioning" | "remote_configuration" {
  return value === "camera_installation" || value === "cable_laying" || value === "commissioning" || value === "remote_configuration";
}
function emptyResult(): InstallationPricingResult {
  return { complete: true, tariffSetId: null, tariffVersion: null, currency: null, vatTreatment: null, lines: [], subtotal: 0, missing: [] };
}
function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
