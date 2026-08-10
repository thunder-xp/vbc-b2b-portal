import { createHash } from "node:crypto";

import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { InvalidStateError, resolveCommercialVisibility } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogService } from "../../catalog/services";
import type { PricingInventoryService } from "../../pricing-inventory/services";
import type { GeneratorPreparedLine, ProposalGeneratorRepository } from "../repositories";
import type { EstimateSectionSystemKey } from "../types";
import { convertMoney, resolveCurrencyRate } from "./commercial-calculation";
import { countGeneratorResolutions, generateRequirements, type GeneratorRequirement } from "./proposal-generator";
import { calculateCctvRequirements, cctvInputFingerprintPayload, type CctvCalculatorInput } from "./proposal-generator-calculator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CreateGeneratedEstimateInput = {
  sessionId: string;
  sessionFingerprint: string;
  finalCustomerId: string;
  name: string;
  projectName?: string | null;
  currencyCode: string;
  validityDays: number;
  requestKey: string;
  requirements: GeneratorRequirement[];
};

export class ProposalGeneratorService {
  constructor(
    private readonly repository: ProposalGeneratorRepository,
    private readonly companyAccess: CompanyAccessService,
    private readonly permissions: PermissionService,
    private readonly catalog: CatalogService,
    private readonly pricing: PricingInventoryService,
  ) {}

  async generate(userId: string, input: { requirement: string; requestKey: string }) {
    const startedAt = performance.now();
    const companyId = await this.resolveCompany(userId, "estimates.manage");
    const requirement = input.requirement.trim().slice(0, 4000);
    if (requirement.length < 10 || !UUID.test(input.requestKey)) throw new InvalidStateError("Опишите задачу подробнее.");
    const fingerprint = createHash("sha256").update(requirement).digest("hex");
    let requirements: GeneratorRequirement[];
    try {
      requirements = generateRequirements(requirement);
      if (!requirements.length) throw new InvalidStateError("Не удалось выделить позиции. Добавьте перечень оборудования или работ.");
    } catch (error) {
      await this.repository.recordSession({ companyId, requestKey: input.requestKey, fingerprint, requirementCount: 0, durationMs: Math.round(performance.now() - startedAt), failed: true, generationMode: "description" });
      throw error;
    }
    const sessionId = await this.repository.recordSession({ companyId, requestKey: input.requestKey, fingerprint, requirementCount: requirements.length, durationMs: Math.round(performance.now() - startedAt), generationMode: "description", resolutionCounts: countGeneratorResolutions(requirements) });
    return { sessionId, fingerprint, requirements };
  }

  async calculateCctv(userId: string, input: { parameters: CctvCalculatorInput; currencyCode: string; requestKey: string }) {
    const startedAt = performance.now();
    const companyId = await this.resolveCompany(userId, "estimates.manage");
    if (!UUID.test(input.requestKey) || !/^[A-Z]{3}$/.test(input.currencyCode)) throw new InvalidStateError("Параметры расчёта некорректны.");
    const facts = cctvInputFingerprintPayload(input.parameters);
    const fingerprint = createHash("sha256").update(JSON.stringify(facts)).digest("hex");
    let requirements: GeneratorRequirement[];
    try {
      const calculated = calculateCctvRequirements(input.parameters);
      if (!calculated.length) throw new InvalidStateError("Укажите хотя бы одну камеру.");
      const mappings = await this.repository.resolveCalculatorProfiles(companyId, [...new Set(calculated.map((line) => line.profileKey).filter((key): key is NonNullable<typeof key> => key !== null))]);
      const mappingByKey = new Map(mappings.map((mapping) => [mapping.profileKey, mapping]));
      requirements = calculated.map((line) => {
        const mapping = line.profileKey ? mappingByKey.get(line.profileKey) : null;
        return mapping ? { ...line, resolution: mapping.resolution, resolvedId: mapping.resolvedId, resolvedLabel: mapping.resolvedLabel } : line;
      });
      const catalogIds = [...new Set(requirements.filter((line) => line.resolution === "catalog" && line.resolvedId).map((line) => line.resolvedId!))];
      if (catalogIds.length) {
        const commercial = await this.pricing.getProductCommercialViews(userId, catalogIds);
        const priceById = new Map(commercial.map((view) => [view.productId, view.retailPrice]));
        requirements = requirements.map((line) => {
          const price = line.resolvedId ? priceById.get(line.resolvedId) : null;
          return price?.currencyCode === input.currencyCode ? { ...line, sellingUnitPrice: price.amount, sellingCurrencyCode: price.currencyCode } : line;
        });
      }
    } catch (error) {
      await this.repository.recordSession({ companyId, requestKey: input.requestKey, fingerprint, requirementCount: 0, durationMs: Math.round(performance.now() - startedAt), failed: true, generationMode: "quick_calculation", structuredFacts: facts });
      throw error;
    }
    const sessionId = await this.repository.recordSession({ companyId, requestKey: input.requestKey, fingerprint, requirementCount: requirements.length, durationMs: Math.round(performance.now() - startedAt), generationMode: "quick_calculation", structuredFacts: facts, resolutionCounts: countGeneratorResolutions(requirements) });
    return { sessionId, fingerprint, requirements, assumptions: requirements.flatMap((line) => line.assumption ? [line.assumption] : []) };
  }

  async createEstimate(userId: string, input: CreateGeneratedEstimateInput) {
    const companyId = await this.resolveCompany(userId, "estimates.pricing.manage");
    validateCreateInput(input);
    const catalogIds = [...new Set(input.requirements.filter((line) => line.resolution === "catalog").map((line) => line.resolvedId!))];
    const serviceIds = [...new Set(input.requirements.filter((line) => line.resolution === "service").map((line) => line.resolvedId!))];
    const externalIds = [...new Set(input.requirements.filter((line) => line.resolution === "own_nomenclature" || line.resolution === "shared_nomenclature").map((line) => line.resolvedId!))];
    const [products, commercial, services, external] = await Promise.all([
      catalogIds.length ? this.catalog.getProductsByIds(userId, catalogIds) : Promise.resolve([]),
      catalogIds.length ? this.pricing.getProductCommercialViews(userId, catalogIds) : Promise.resolve([]),
      this.repository.resolveServices(companyId, serviceIds),
      this.repository.resolveExternalNomenclature(companyId, externalIds),
    ]);
    if (products.length !== catalogIds.length || services.length !== serviceIds.length || external.length !== externalIds.length) throw new InvalidStateError("Одна из выбранных позиций больше недоступна. Повторите выбор.");
    const productById = new Map(products.map((product) => [product.id, product]));
    const commercialById = new Map(commercial.map((view) => [view.productId, view]));
    const serviceById = new Map(services.map((service) => [service.id, service]));
    const externalById = new Map(external.map((item) => [item.id, item]));
    const permissionContext = await this.permissions.getEffectivePermissionContext(userId, companyId);
    const canViewPartnerPrice = resolveCommercialVisibility(permissionContext).canViewPartnerPrice;
    const needsRetailRate = commercial.some((view) => view.retailPrice?.currencyCode && view.retailPrice.currencyCode !== input.currencyCode);
    const needsCostRate = canViewPartnerPrice && commercial.some((view) => view.partnerPrice?.currencyCode && view.partnerPrice.currencyCode !== input.currencyCode);
    const [retailRate, costRate] = await Promise.all([
      needsRetailRate ? this.pricing.getRetailUsdMdlRateSnapshot?.(userId) ?? null : null,
      needsCostRate ? this.pricing.getApprovedUsdMdlRateSnapshot?.(userId) ?? null : null,
    ]);
    if (needsRetailRate && !retailRate) throw new InvalidStateError("Для пересчёта розничной цены нет опубликованного курса.");
    if (needsCostRate && !costRate) throw new InvalidStateError("Для пересчёта закупочной цены нет опубликованного курса.");

    const lines: GeneratorPreparedLine[] = input.requirements.map((requirement) => {
      const common = { sectionKey: requirement.sectionKey, serviceId: null, description: requirement.description, quantity: requirement.quantity, unit: requirement.unit, resolution: requirement.resolution };
      if (requirement.resolution === "catalog") {
        const product = productById.get(requirement.resolvedId!);
        const view = commercialById.get(requirement.resolvedId!);
        if (!product) throw new InvalidStateError("Выбранный товар больше недоступен.");
        const retail = view?.retailPrice ?? null;
        const rate = !retail?.currencyCode ? null : retail.currencyCode === input.currencyCode ? 1 : resolveCurrencyRate(retail.currencyCode, input.currencyCode, retailRate!.mdlPerUsdRate);
        const cost = canViewPartnerPrice ? view?.partnerPrice ?? null : null;
        const costExchangeRate = !cost?.currencyCode ? null : cost.currencyCode === input.currencyCode ? 1 : resolveCurrencyRate(cost.currencyCode, input.currencyCode, costRate!.mdlPerUsdRate);
        return { ...common, lineType: "product", productId: product.id, externalNomenclatureId: null, skuSnapshot: product.sku, productNameSnapshot: product.name, description: product.name, sourceUnitPrice: cost?.amount ?? null, sourceCurrencyCode: cost?.currencyCode ?? null, sourceSnapshotAt: cost?.lastUpdatedAt ?? null, internalCostUnitPrice: cost?.amount ?? null, convertedCostUnitPrice: cost && costExchangeRate ? convertMoney(cost.amount, costExchangeRate) : null, exchangeRate: costExchangeRate, exchangeRateEffectiveDate: !costExchangeRate ? null : costExchangeRate === 1 ? cost?.lastUpdatedAt?.slice(0,10) ?? null : costRate?.effectiveDate ?? null, sellingUnitPrice: retail && rate ? convertMoney(retail.amount, rate) : null };
      }
      if (requirement.resolution === "service") {
        const service = serviceById.get(requirement.resolvedId!);
        if (!service || service.unit !== requirement.unit) throw new InvalidStateError("Выбранная услуга больше недоступна.");
        return { ...common, lineType: "service", productId: null, serviceId: service.id, externalNomenclatureId: null,
          skuSnapshot: null, productNameSnapshot: null, sourceUnitPrice: null, sourceCurrencyCode: null,
          sourceSnapshotAt: null, internalCostUnitPrice: service.defaultCost, convertedCostUnitPrice: service.defaultCost,
          exchangeRate: service.defaultCost === null ? null : 1, exchangeRateEffectiveDate: null,
          description: service.name, sellingUnitPrice: service.defaultSellingPrice };
      }
      if (requirement.resolution === "own_nomenclature" || requirement.resolution === "shared_nomenclature") {
        const item = externalById.get(requirement.resolvedId!);
        if (!item) throw new InvalidStateError("Выбранная внешняя позиция больше недоступна.");
        return { ...common, lineType: "external", productId: null, externalNomenclatureId: item.id, skuSnapshot: null, productNameSnapshot: null, sourceUnitPrice: null, sourceCurrencyCode: null, sourceSnapshotAt: null, description: item.name, unit: item.unit, sellingUnitPrice: null };
      }
      return { ...common, lineType: "custom", productId: null, externalNomenclatureId: null, skuSnapshot: null, productNameSnapshot: null, sourceUnitPrice: null, sourceCurrencyCode: null, sourceSnapshotAt: null, sellingUnitPrice: null };
    });
    const estimateId = await this.repository.createEstimate({ companyId, sessionId: input.sessionId, finalCustomerId: input.finalCustomerId, name: input.name.trim(), projectName: input.projectName?.trim() || null, currencyCode: input.currencyCode, validityDays: input.validityDays, requestKey: input.requestKey, fingerprint: input.sessionFingerprint, lines });
    return { estimateId, counts: countGeneratorResolutions(input.requirements) };
  }

  async submitFeedback(userId: string, input: { sessionId: string; answer: "yes" | "partial" | "no"; comment?: string | null }) {
    await this.resolveCompany(userId, "estimates.view");
    if (!UUID.test(input.sessionId) || !["yes", "partial", "no"].includes(input.answer)) throw new InvalidStateError("Ответ некорректен.");
    return this.repository.submitFeedback({ sessionId: input.sessionId, answer: input.answer, comment: input.comment?.trim().slice(0, 500) || null });
  }

  async canPromptFeedback(userId: string, sessionId: string, estimateId: string) {
    await this.resolveCompany(userId, "estimates.view");
    if (!UUID.test(sessionId) || !UUID.test(estimateId)) return false;
    return this.repository.canPromptFeedback(sessionId, estimateId);
  }

  getAdminReport(limit = 20) { return this.repository.getAdminReport(Math.max(1, Math.min(limit, 50))); }

  listCalculatorProfiles() { return this.repository.listCalculatorProfiles(); }

  searchCalculatorTargets(query: string, limit = 12) {
    const normalized = query.trim().slice(0, 120);
    if (normalized.length < 2) throw new InvalidStateError("Введите не менее двух символов.");
    return this.repository.searchCalculatorTargets(normalized, Math.max(1, Math.min(limit, 20)));
  }

  updateCalculatorProfile(input: { profileKey: string; expectedVersion: number; targetType: "catalog" | "service" | "external_nomenclature" | "unresolved"; targetId: string | null }) {
    if (!/^cctv\.[a-z0-9.]+$/.test(input.profileKey) || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1
      || !["catalog", "service", "external_nomenclature", "unresolved"].includes(input.targetType)
      || (input.targetType !== "unresolved" && (!input.targetId || !UUID.test(input.targetId)))) {
      throw new InvalidStateError("Настройка профиля некорректна.");
    }
    return this.repository.updateCalculatorProfile(input);
  }

  private async resolveCompany(userId: string, permission: string) {
    const memberships = await this.companyAccess.getOwnMemberships(userId);
    const membership = memberships.find((item) => item.status === MembershipStatus.Active);
    const context = await this.companyAccess.getActiveCompanyContext(userId, membership?.companyId ?? "");
    await this.permissions.ensurePermission(userId, context.company.id, permission);
    return context.company.id;
  }
}

function validateCreateInput(input: CreateGeneratedEstimateInput) {
  if (![input.sessionId, input.finalCustomerId, input.requestKey].every((value) => UUID.test(value)) || !/^[0-9a-f]{64}$/.test(input.sessionFingerprint)) throw new InvalidStateError("Данные генератора некорректны.");
  if (!input.name.trim() || input.name.length > 200 || !/^[A-Z]{3}$/.test(input.currencyCode) || input.validityDays < 1 || input.validityDays > 365) throw new InvalidStateError("Параметры сметы некорректны.");
  if (!input.requirements.length || input.requirements.length > 30) throw new InvalidStateError("Добавьте от 1 до 30 позиций.");
  for (const line of input.requirements) {
    if (!line.description.trim() || line.description.length > 500 || !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 999999) throw new InvalidStateError("Проверьте описание и количество позиций.");
    if (!(["equipment", "installation_materials", "installation_works", "commissioning_works"] as EstimateSectionSystemKey[]).includes(line.sectionKey)) throw new InvalidStateError("Раздел позиции некорректен.");
    if (line.resolution !== "unresolved" && (!line.resolvedId || !UUID.test(line.resolvedId))) throw new InvalidStateError("Выбранная позиция некорректна.");
  }
}
