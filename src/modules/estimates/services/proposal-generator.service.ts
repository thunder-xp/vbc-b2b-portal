import { createHash } from "node:crypto";

import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { InvalidStateError, resolveCommercialVisibility } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogService } from "../../catalog/services";
import type { PricingInventoryService } from "../../pricing-inventory/services";
import { selectCctvCameraCandidates } from "../../cctv-calculation";
import type { SupabaseCctvCameraCandidateRepository } from "../../cctv-calculation/cctv-camera-candidate.repository";
import type { SupabaseCctvObjectConfigurationRepository } from "../../cctv-calculation/cctv-object-configuration.repository";
import type { GeneratorPreparedLine, ProposalGeneratorRepository } from "../repositories";
import type { EstimateSectionSystemKey } from "../types";
import { convertMoney, resolveCurrencyRate } from "./commercial-calculation";
import { countGeneratorResolutions, generateRequirements, type GeneratorRequirement } from "./proposal-generator";
import { calculateCctvConfiguration, CCTV_CALCULATOR_PROFILE_KEYS, cctvInputFingerprintPayload, type CctvCalculatorInput, type CctvConfigurationSummary } from "./proposal-generator-calculator";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CreateGeneratedEstimateInput = {
  sessionId: string;
  sessionFingerprint: string;
  finalCustomerId: string;
  name: string;
  projectName?: string | null;
  currencyCode: string;
  vatMode: "none" | "included";
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
    private readonly cameraCandidates?: Pick<SupabaseCctvCameraCandidateRepository, "resolve">,
    private readonly objectServices?: Pick<SupabaseCctvObjectConfigurationRepository, "resolve" | "resolveForGenerator">,
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
    const contextResolvedAt = performance.now();
    if (!UUID.test(input.requestKey) || !/^[A-Z]{3}$/.test(input.currencyCode)) throw new InvalidStateError("Параметры расчёта некорректны.");
    const facts = cctvInputFingerprintPayload(input.parameters);
    const fingerprint = createHash("sha256").update(JSON.stringify(facts)).digest("hex");
    let requirements: GeneratorRequirement[];
    let compatibility: CctvConfigurationSummary;
    let rulesCalculatedAt = contextResolvedAt;
    let mappingsResolvedAt = contextResolvedAt;
    let commercialResolvedAt = contextResolvedAt;
    const recommendedCameraProductIds: string[] = [];
    try {
      const placements = [input.parameters.indoorCameraCount > 0 && "indoor", input.parameters.outdoorCameraCount > 0 && "outdoor"]
        .filter((value): value is "indoor" | "outdoor" => Boolean(value));
      const [mappings, cameraPool, governedServices] = await Promise.all([
        this.repository.resolveCalculatorProfiles(companyId, [...CCTV_CALCULATOR_PROFILE_KEYS]),
        this.cameraCandidates?.resolve(input.parameters.objectType, placements) ?? Promise.resolve([]),
        this.objectServices?.resolve(input.parameters.objectType, requestedServiceTypes(input.parameters)) ?? Promise.resolve([]),
      ]);
      mappingsResolvedAt = performance.now();
      const calculation = calculateCctvConfiguration(input.parameters, mappings);
      compatibility = calculation.compatibility;
      const calculated = calculation.requirements;
      rulesCalculatedAt = performance.now();
      if (!calculated.length) throw new InvalidStateError("Укажите хотя бы одну камеру.");
      const mappingByKey = new Map(mappings.map((mapping) => [mapping.profileKey, mapping]));
      const serviceByRequestType = new Map(governedServices.map((service) => [service.requestServiceType, service]));
      requirements = calculated.map((line) => {
        const cameraKind = line.id === "cctv-indoor" ? "indoor_camera" : line.id === "cctv-outdoor" ? "outdoor_camera" : null;
        if (cameraKind && this.cameraCandidates) {
          const selected = selectCctvCameraCandidates(input.parameters, {
            kind: cameraKind,
            cameraResolutionMp: cameraKind === "indoor_camera" ? input.parameters.indoorResolutionMp : input.parameters.outdoorResolutionMp,
          }, cameraPool).recommended;
          if (selected) {
            recommendedCameraProductIds.push(selected.productId);
            const candidate = cameraPool.find((item) => item.productId === selected.productId)!;
            return { ...line, resolution: "catalog" as const, resolvedId: selected.productId,
              governedResolvedId: selected.productId, resolvedLabel: candidate.name, resolvedSku: candidate.sku,
              description: candidate.name };
          }
          return line;
        }
        const mapping = line.profileKey ? mappingByKey.get(line.profileKey) : null;
        const serviceType = serviceTypeForProfile(line.profileKey);
        const governedService = serviceType ? serviceByRequestType.get(serviceType) : null;
        if (serviceType && this.objectServices && (!governedService?.serviceCode
          || !governedService.estimateServiceId || governedService.unitPrice == null)) {
          return { ...line, resolution: "unresolved" as const, resolvedId: null, governedResolvedId: null,
            resolvedLabel: null, sellingUnitPrice: null, sellingCurrencyCode: null, sellingVatMode: null };
        }
        if (serviceType && this.objectServices && governedService?.serviceCode && governedService.estimateServiceId) {
          const configuredPrice = governedService.currency === input.currencyCode ? governedService.unitPrice : null;
          return { ...line, resolution: "service" as const, resolvedId: governedService.estimateServiceId,
            governedResolvedId: governedService.estimateServiceId,
            resolvedLabel: governedService.serviceLabel ?? line.description,
            description: governedService.serviceLabel ?? line.description,
            sellingUnitPrice: configuredPrice,
            sellingCurrencyCode: configuredPrice === null ? null : governedService.currency,
            sellingVatMode: configuredPrice === null ? null
              : governedService.vatTreatment === "excluded" ? "excluded" : "included" };
        }
        const governedServicePrice = mapping?.resolution === "service" && governedService?.estimateServiceId === mapping.resolvedId
          && governedService.currency === input.currencyCode ? governedService.unitPrice : null;
        const configuredServicePrice = governedServicePrice ?? (!this.objectServices && mapping?.resolution === "service"
          && mapping.defaultSellingCurrencyCode === input.currencyCode ? mapping.defaultSellingUnitPrice : null);
        const identity = mapping?.resolvedLabel ? splitResolvedCatalogLabel(mapping.resolvedLabel) : null;
        return mapping ? {
          ...line, resolution: mapping.resolution, resolvedId: mapping.resolvedId, governedResolvedId: mapping.resolvedId,
          resolvedLabel: identity?.name ?? mapping.resolvedLabel,
          resolvedSku: mapping.resolution === "catalog" ? identity?.sku ?? null : null,
          description: mapping.resolution === "unresolved" ? line.description : identity?.name ?? mapping.resolvedLabel ?? line.description,
          sellingUnitPrice: configuredServicePrice,
          sellingCurrencyCode: configuredServicePrice === null ? null
            : governedService?.currency ?? mapping.defaultSellingCurrencyCode,
          sellingVatMode: configuredServicePrice === null ? null : governedService
            ? governedService.vatTreatment === "excluded" ? "excluded" : "included"
            : mapping?.defaultSellingVatMode ?? null,
        } : line;
      });
      const catalogIds = [...new Set(requirements.filter((line) => line.resolution === "catalog" && line.resolvedId).map((line) => line.resolvedId!))];
      if (catalogIds.length) {
        const [commercial, productReferences] = await Promise.all([
          this.pricing.getProductCommercialViews(userId, catalogIds),
          this.catalog.getProductReferencesByIds?.(userId, catalogIds) ?? Promise.resolve([]),
        ]);
        const commercialById = new Map(commercial.map((view) => [view.productId, view]));
        const productReferenceById = new Map(productReferences.map((product) => [product.productId, product]));
        requirements = requirements.map((line) => {
          const view = line.resolvedId ? commercialById.get(line.resolvedId) : null;
          const reference = line.resolvedId ? productReferenceById.get(line.resolvedId) : null;
          const withImage = reference ? { ...line, resolvedImageUrl: reference.thumbnail } : line;
          const withStock = view?.stock ? { ...withImage, resolvedStockLabel: view.stock.label } : withImage;
          return view?.retailPrice?.currencyCode === input.currencyCode
            ? { ...withStock, sellingUnitPrice: view.retailPrice.amount, sellingCurrencyCode: view.retailPrice.currencyCode }
            : withStock;
        });
      }
      commercialResolvedAt = performance.now();
    } catch (error) {
      await this.repository.recordSession({ companyId, requestKey: input.requestKey, fingerprint, requirementCount: 0, durationMs: Math.round(performance.now() - startedAt), failed: true, generationMode: "quick_calculation", structuredFacts: facts });
      throw error;
    }
    const telemetryStartedAt = performance.now();
    const poeLine = requirements.find((line) => line.id === "cctv-poe");
    const structuredFacts = {
      ...facts,
      autoNvrProfile: compatibility.automaticRecorderProfile,
      proposedHddCapacityTb: compatibility.archive.physicalCapacityTb,
      poeAutoProfile: poeLine?.profileKey ?? null,
      storageIncompatibilityDetected: compatibility.issues.some((issue) => issue.code === "storage_incompatible"),
      insufficientPoeWarning: compatibility.issues.some((issue) => issue.code === "insufficient_poe"),
      automaticRecorderProfile: compatibility.automaticRecorderProfile,
      compatibleConfigurationFound: compatibility.compatibleConfigurationFound,
      cameraSelectionPolicyVersion: "cctv_camera_selection_v1",
      recommendedCameraProductIds,
    };
    const sessionId = await this.repository.recordSession({ companyId, requestKey: input.requestKey, fingerprint, requirementCount: requirements.length, durationMs: Math.round(telemetryStartedAt - startedAt), generationMode: "quick_calculation", structuredFacts, resolutionCounts: countGeneratorResolutions(requirements) });
    console.info({
      event: "proposal_generator_quick_calculation_performance",
      companyId,
      sessionId,
      requirementCount: requirements.length,
      stageMs: {
        context: Math.round(contextResolvedAt - startedAt),
        profileResolution: Math.round(mappingsResolvedAt - contextResolvedAt),
        rules: Math.round(rulesCalculatedAt - mappingsResolvedAt),
        catalogCommercialResolution: Math.round(commercialResolvedAt - rulesCalculatedAt),
        telemetryWrite: Math.round(performance.now() - telemetryStartedAt),
      },
      durationMs: Math.round(performance.now() - startedAt),
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    });
    return { sessionId, fingerprint, requirements, assumptions: requirements.flatMap((line) => line.assumption ? [line.assumption] : []), compatibility };
  }

  async createEstimate(userId: string, input: CreateGeneratedEstimateInput) {
    const startedAt = performance.now();
    const companyId = await this.resolveCompany(userId, "estimates.pricing.manage");
    const contextResolvedAt = performance.now();
    validateCreateInput(input);
    const catalogIds = [...new Set(input.requirements.filter((line) => line.resolution === "catalog").map((line) => line.resolvedId!))];
    const serviceIds = [...new Set(input.requirements.filter((line) => line.resolution === "service").map((line) => line.resolvedId!))];
    const serviceProfileKeys = [...new Set(input.requirements.filter((line) => line.resolution === "service" && line.profileKey).map((line) => line.profileKey!))];
    const externalIds = [...new Set(input.requirements.filter((line) => line.resolution === "own_nomenclature" || line.resolution === "shared_nomenclature").map((line) => line.resolvedId!))];
    const [products, commercial, services, external, governedServices, permissionContext] = await Promise.all([
      catalogIds.length ? this.catalog.getProductOrderIdentities(userId, catalogIds) : Promise.resolve([]),
      catalogIds.length ? this.pricing.getProductCommercialViews(userId, catalogIds) : Promise.resolve([]),
      this.repository.resolveServices(companyId, serviceIds),
      this.repository.resolveExternalNomenclature(companyId, externalIds),
      this.objectServices?.resolveForGenerator(companyId, input.sessionId, serviceProfileKeys)
        ?? this.repository.resolveCalculatorProfiles(companyId, serviceProfileKeys),
      this.permissions.getEffectivePermissionContext(userId, companyId),
    ]);
    const projectionsResolvedAt = performance.now();
    if (products.length !== catalogIds.length || services.length !== serviceIds.length || external.length !== externalIds.length) throw new InvalidStateError("Одна из выбранных позиций больше недоступна. Повторите выбор.");
    const productById = new Map(products.map((product) => [product.id, product]));
    const commercialById = new Map(commercial.map((view) => [view.productId, view]));
    const serviceById = new Map(services.map((service) => [service.id, service]));
    const serviceProfileByKey = new Map(governedServices.map((profile) => [profile.profileKey, profile]));
    const externalById = new Map(external.map((item) => [item.id, item]));
    const canViewPartnerPrice = resolveCommercialVisibility(permissionContext).canViewPartnerPrice;
    const needsRetailRate = commercial.some((view) => view.retailPrice?.currencyCode && view.retailPrice.currencyCode !== input.currencyCode);
    const needsCostRate = canViewPartnerPrice && commercial.some((view) => view.partnerPrice?.currencyCode && view.partnerPrice.currencyCode !== input.currencyCode);
    const [retailRate, costRate] = await Promise.all([
      needsRetailRate ? this.pricing.getRetailUsdMdlRateSnapshot?.(userId) ?? null : null,
      needsCostRate ? this.pricing.getApprovedUsdMdlRateSnapshot?.(userId) ?? null : null,
    ]);
    const ratesResolvedAt = performance.now();
    if (needsRetailRate && !retailRate) throw new InvalidStateError("Для пересчёта розничной цены нет опубликованного курса.");
    if (needsCostRate && !costRate) throw new InvalidStateError("Для пересчёта закупочной цены нет опубликованного курса.");

    const lines: GeneratorPreparedLine[] = input.requirements.map((requirement) => {
      const common = { sectionKey: requirement.sectionKey, serviceId: null, profileKey: requirement.profileKey ?? null, description: requirement.description, quantity: requirement.quantity, unit: requirement.unit, resolution: requirement.resolution };
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
        const profile = requirement.profileKey ? serviceProfileByKey.get(requirement.profileKey) : null;
        const configuredPrice = profile && "estimateServiceId" in profile
          ? profile.estimateServiceId === service.id && profile.currency === input.currencyCode ? profile.unitPrice : null
          : profile && "resolution" in profile && profile.resolution === "service" && profile.resolvedId === service.id
            && profile.defaultSellingCurrencyCode === input.currencyCode ? profile.defaultSellingUnitPrice : null;
        return { ...common, lineType: "service", productId: null, serviceId: service.id, externalNomenclatureId: null,
          skuSnapshot: null, productNameSnapshot: null, sourceUnitPrice: null, sourceCurrencyCode: null,
          sourceSnapshotAt: null, internalCostUnitPrice: service.defaultCost, convertedCostUnitPrice: service.defaultCost,
          exchangeRate: service.defaultCost === null ? null : 1, exchangeRateEffectiveDate: null,
          description: service.name, sellingUnitPrice: configuredPrice ?? service.defaultSellingPrice };
      }
      if (requirement.resolution === "own_nomenclature" || requirement.resolution === "shared_nomenclature") {
        const item = externalById.get(requirement.resolvedId!);
        if (!item) throw new InvalidStateError("Выбранная внешняя позиция больше недоступна.");
        return { ...common, lineType: "external", productId: null, externalNomenclatureId: item.id, skuSnapshot: null, productNameSnapshot: null, sourceUnitPrice: null, sourceCurrencyCode: null, sourceSnapshotAt: null, description: item.name, unit: item.unit, sellingUnitPrice: null };
      }
      return { ...common, lineType: "custom", productId: null, externalNomenclatureId: null, skuSnapshot: null, productNameSnapshot: null, sourceUnitPrice: null, sourceCurrencyCode: null, sourceSnapshotAt: null, sellingUnitPrice: null };
    });
    const linesPreparedAt = performance.now();
    const estimateId = await this.repository.createEstimate({ companyId, sessionId: input.sessionId, finalCustomerId: input.finalCustomerId, name: input.name.trim(), projectName: input.projectName?.trim() || null, currencyCode: input.currencyCode, vatMode: input.vatMode, validityDays: input.validityDays, requestKey: input.requestKey, fingerprint: input.sessionFingerprint, lines });
    console.info({
      event: "proposal_generator_estimate_creation_performance",
      companyId,
      estimateId,
      lineCount: lines.length,
      stageMs: {
        context: Math.round(contextResolvedAt - startedAt),
        boundedProjections: Math.round(projectionsResolvedAt - contextResolvedAt),
        currencyRates: Math.round(ratesResolvedAt - projectionsResolvedAt),
        prepareLines: Math.round(linesPreparedAt - ratesResolvedAt),
        createRpc: Math.round(performance.now() - linesPreparedAt),
      },
      durationMs: Math.round(performance.now() - startedAt),
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    });
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

  updateCalculatorServicePrice(input: {
    profileKey: string; expectedVersion: number; unitPrice: number | null;
    currencyCode: string | null; vatMode: "included" | "excluded" | null;
  }) {
    const empty = input.unitPrice === null && input.currencyCode === null && input.vatMode === null;
    if (!/^cctv\.[a-z0-9.]+$/.test(input.profileKey) || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1
      || (!empty && (!Number.isFinite(input.unitPrice) || input.unitPrice! <= 0 || input.unitPrice! > 9999999999999999.99
        || !input.currencyCode?.match(/^[A-Z]{3}$/) || !["included", "excluded"].includes(input.vatMode ?? "")))) {
      throw new InvalidStateError("Настройка цены некорректна.");
    }
    return this.repository.updateCalculatorServicePrice(input);
  }

  private async resolveCompany(userId: string, permission: string) {
    const memberships = await this.companyAccess.getOwnMemberships(userId);
    const membership = memberships.find((item) => item.status === MembershipStatus.Active);
    const context = await this.companyAccess.getActiveCompanyContext(userId, membership?.companyId ?? "");
    await this.permissions.ensurePermission(userId, context.company.id, permission);
    return context.company.id;
  }
}

function requestedServiceTypes(input: CctvCalculatorInput) {
  return [
    input.installationRequested && "camera_installation",
    input.installationRequested && input.cableLength > 0 && "cable_laying",
    input.commissioningRequested && "commissioning",
    input.remoteViewingRequested && "remote_configuration",
  ].filter((value): value is "camera_installation" | "cable_laying" | "commissioning" | "remote_configuration" => Boolean(value));
}

function serviceTypeForProfile(profileKey?: string | null): "camera_installation" | "cable_laying" | "commissioning" | "remote_configuration" | null {
  if (profileKey === "cctv.install.camera") return "camera_installation";
  if (profileKey === "cctv.install.cable") return "cable_laying";
  if (profileKey === "cctv.commissioning.system") return "commissioning";
  if (profileKey === "cctv.commissioning.remote") return "remote_configuration";
  return null;
}

function splitResolvedCatalogLabel(label: string) {
  const separator = label.indexOf(" · ");
  return separator < 0 ? { sku: null, name: label } : { sku: label.slice(0, separator), name: label.slice(separator + 3) };
}

function validateCreateInput(input: CreateGeneratedEstimateInput) {
  if (![input.sessionId, input.finalCustomerId, input.requestKey].every((value) => UUID.test(value)) || !/^[0-9a-f]{64}$/.test(input.sessionFingerprint)) throw new InvalidStateError("Данные генератора некорректны.");
  if (!input.name.trim() || input.name.length > 200 || !/^[A-Z]{3}$/.test(input.currencyCode) || !["none", "included"].includes(input.vatMode) || input.validityDays < 1 || input.validityDays > 365) throw new InvalidStateError("Параметры сметы некорректны.");
  if (!input.requirements.length || input.requirements.length > 30) throw new InvalidStateError("Добавьте от 1 до 30 позиций.");
  for (const line of input.requirements) {
    if (!line.description.trim() || line.description.length > 500 || !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 999999) throw new InvalidStateError("Проверьте описание и количество позиций.");
    if (!(["equipment", "installation_materials", "installation_works", "commissioning_works"] as EstimateSectionSystemKey[]).includes(line.sectionKey)) throw new InvalidStateError("Раздел позиции некорректен.");
    if (line.resolution !== "unresolved" && (!line.resolvedId || !UUID.test(line.resolvedId))) throw new InvalidStateError("Выбранная позиция некорректна.");
    if (line.profileKey && !/^cctv\.[a-z0-9.]+$/.test(line.profileKey)) throw new InvalidStateError("Профиль позиции некорректен.");
  }
}
