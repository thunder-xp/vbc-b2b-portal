import type { CctvObjectType } from "../../cctv-calculation";
import type { SupabaseCctvObjectConfigurationRepository } from "../../cctv-calculation/cctv-object-configuration.repository";
import type { InstallationPricingResult, InstallationPricingVariants, InstallationServiceType, InstallationUnitCode } from "../types";

export class CctvObjectServicePricingService {
  constructor(private readonly repository: Pick<SupabaseCctvObjectConfigurationRepository, "resolve">
    & Partial<Pick<SupabaseCctvObjectConfigurationRepository, "resolveVariants">>) {}

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

  async priceVariants(objectType: CctvObjectType, requirements: Array<{
    serviceType: InstallationServiceType;
    quantity: number;
    unitCode: InstallationUnitCode;
  }>): Promise<InstallationPricingVariants> {
    if (!requirements.length) return { recommended: emptyResult(), economy: emptyResult() };
    if (!this.repository.resolveVariants) {
      const recommended = await this.price(objectType, requirements);
      return { recommended, economy: recommended };
    }
    const supported = requirements.flatMap((item) => isCalculatorService(item.serviceType) ? [{ ...item, serviceType: item.serviceType }] : []);
    if (supported.length !== requirements.length) {
      const missing = [...new Set(requirements.filter((item) => !isCalculatorService(item.serviceType)).map((item) => item.serviceType))];
      const incomplete = { ...emptyResult(), complete: false, missing };
      return { recommended: incomplete, economy: incomplete };
    }
    const resolved = await this.repository.resolveVariants(objectType, supported.map((item) => item.serviceType));
    return {
      recommended: priceResolved(supported, resolved.recommended),
      economy: priceResolved(supported, resolved.economy),
    };
  }
}

function priceResolved(requirements: Array<{ serviceType: InstallationServiceType; quantity: number; unitCode: InstallationUnitCode }>,
  resolved: Awaited<ReturnType<SupabaseCctvObjectConfigurationRepository["resolve"]>>): InstallationPricingResult {
  const byType = new Map<string, (typeof resolved)[number]>(resolved.map((item) => [item.requestServiceType, item]));
  const missing = requirements.filter((item) => {
    const match = byType.get(item.serviceType);
    return !match?.serviceCode || match.unitCode !== item.unitCode || match.unitPrice == null || !match.currency || !match.tariffSetId;
  }).map((item) => item.serviceType);
  const evidence = resolved.find((item) => item.tariffSetId && item.currency);
  if (missing.length) return { ...emptyResult(), complete: false, tariffSetId: evidence?.tariffSetId ?? null,
    tariffVersion: evidence?.tariffVersion ?? null, currency: evidence?.currency ?? null,
    vatTreatment: evidence?.vatTreatment ?? null, missing: [...new Set(missing)] };
  const first = byType.get(requirements[0].serviceType)!;
  const lines = requirements.map((item) => {
    const match = byType.get(item.serviceType)!;
    return { ...item, unitPrice: match.unitPrice!, amount: money(item.quantity * match.unitPrice!),
      resolvedServiceCode: match.serviceCode!, serviceLabel: match.serviceLabel,
      complexityClass: match.complexityClass ?? null };
  });
  return { complete: true, tariffSetId: first.tariffSetId, tariffVersion: first.tariffVersion,
    currency: first.currency, vatTreatment: first.vatTreatment, lines,
    subtotal: money(lines.reduce((sum, line) => sum + line.amount, 0)), missing: [] };
}

function isCalculatorService(value: InstallationServiceType): value is "camera_installation" | "cable_laying" | "commissioning" | "remote_configuration" | "ai_scenario_programming" {
  return value === "camera_installation" || value === "cable_laying" || value === "commissioning"
    || value === "remote_configuration" || value === "ai_scenario_programming";
}
function emptyResult(): InstallationPricingResult {
  return { complete: true, tariffSetId: null, tariffVersion: null, currency: null, vatTreatment: null, lines: [], subtotal: 0, missing: [] };
}
function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
