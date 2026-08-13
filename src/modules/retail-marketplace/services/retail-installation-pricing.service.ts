import type { RetailMarketplaceRepository } from "../repositories/retail-marketplace.repository";
import type { InstallationPricingResult, InstallationServiceType, InstallationUnitCode } from "../types";

export class RetailInstallationPricingService {
  constructor(private readonly repository: Pick<RetailMarketplaceRepository, "getCurrentTariffs">) {}
  async price(requirements: Array<{ serviceType: InstallationServiceType; quantity: number; unitCode: InstallationUnitCode }>): Promise<InstallationPricingResult> {
    if (!requirements.length) return { complete: true, tariffSetId: null, tariffVersion: null, currency: null, vatTreatment: null, lines: [], subtotal: 0, missing: [] };
    const tariffSet = await this.repository.getCurrentTariffs("cctv");
    if (!tariffSet) return { complete: false, tariffSetId: null, tariffVersion: null, currency: null, vatTreatment: null, lines: [], subtotal: null, missing: [...new Set(requirements.map((row) => row.serviceType))] };
    const tariffs = new Map(tariffSet.lines.map((line) => [line.serviceType, line]));
    const missing = requirements.filter((row) => tariffs.get(row.serviceType)?.unitCode !== row.unitCode).map((row) => row.serviceType);
    if (missing.length) return { complete: false, tariffSetId: tariffSet.tariffSetId, tariffVersion: tariffSet.version, currency: tariffSet.currency, vatTreatment: tariffSet.vatTreatment, lines: [], subtotal: null, missing: [...new Set(missing)] };
    const lines = requirements.map((row) => { const tariff = tariffs.get(row.serviceType)!; return { ...row, unitPrice: tariff.unitPrice, amount: money(row.quantity * tariff.unitPrice) }; });
    return { complete: true, tariffSetId: tariffSet.tariffSetId, tariffVersion: tariffSet.version, currency: tariffSet.currency, vatTreatment: tariffSet.vatTreatment, lines, subtotal: money(lines.reduce((sum, line) => sum + line.amount, 0)), missing: [] };
  }
}
function money(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
