import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { InvalidStateError, NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogService } from "../../catalog/services";
import type { CartService } from "../../orders/services";
import type { PricingInventoryService } from "../../pricing-inventory/services";
import { EstimateVersionConflictError, type EstimateLifecycleRepository, type EstimateRepository, type ProposalDeliveryRepository, type RefreshedProductPrice } from "../repositories";
import type {
  Estimate,
  EstimateCartConversionSummary,
  EstimateSentChannel,
  EstimateRejectionReason,
  EstimateVersion,
  EstimateVersionStatus,
  EstimateWorkflowDto,
  ProposalDelivery,
  ProposalDeliverySummaryDto,
  ProposalTemplate,
} from "../types";
import { convertMoney, resolveCurrencyRate } from "./commercial-calculation";
import { deriveEstimateDraftReadiness, deriveEstimateReadiness } from "./draft-readiness";
import { deriveEstimateGuidedState } from "./guided-state";
import { isProposalEmailConfigured } from "./proposal-email.provider";
import type { DefaultProposalService } from "./proposal.service";

const VIEW_PERMISSION = "estimates.view";
const MANAGE_PERMISSION = "estimates.manage";
const TEMPLATE_PERMISSION = "proposal_templates.manage";
const CONVERT_PERMISSION = "estimates.convert_to_cart";
const SEND_PERMISSION = "proposal.send";
const ORDERS_PERMISSION = "orders.manage";

export class EstimateLifecycleService {
  constructor(
    private readonly lifecycleRepository: EstimateLifecycleRepository,
    private readonly deliveryRepository: ProposalDeliveryRepository,
    private readonly estimateRepository: EstimateRepository,
    private readonly proposalService: DefaultProposalService,
    private readonly cartService: CartService,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
    private readonly catalogService: CatalogService,
    private readonly pricingInventoryService: PricingInventoryService,
  ) {}

  async getWorkflow(userId: string, estimateId: string): Promise<EstimateWorkflowDto> {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    const normalizedEstimateId = normalizeId(estimateId);
    const [aggregate, versions] = await Promise.all([
      this.estimateRepository.findAggregateById(normalizedEstimateId),
      this.lifecycleRepository.listVersions(normalizedEstimateId),
    ]);
    if (!aggregate || aggregate.estimate.companyId !== companyId) throw new NotFoundError("Смета не найдена.");
    const estimate = aggregate.estimate;
    const versionIds = versions.map((version) => version.id);
    const guidedVersion = versions.find((version) => version.id === estimate.acceptedVersionId) ?? versions[0] ?? null;
    const [documents, deliveries, permissionContext, cartConversions] = await Promise.all([
      this.lifecycleRepository.listLatestDocuments(versionIds),
      this.deliveryRepository.listByVersionIds(versionIds),
      this.permissionService.getEffectivePermissionContext(userId, companyId),
      estimate.lifecycleStatus === "accepted" && guidedVersion && estimate.acceptedVersionId === guidedVersion.id
        ? this.lifecycleRepository.listVersionCartConversions(estimate.id, guidedVersion.id)
        : Promise.resolve([]),
    ]);
    const deliveriesByVersion = summarizeDeliveries(deliveries);
    const permissionCodes = new Set(permissionContext.effectivePermissionCodes);
    const permissions = {
      canManage: permissionCodes.has(MANAGE_PERMISSION),
      canSend: permissionCodes.has(SEND_PERMISSION),
      canConvert: permissionCodes.has(CONVERT_PERMISSION),
      canManageOrders: permissionCodes.has(ORDERS_PERMISSION),
    };
    const guidedDeliveries = guidedVersion ? deliveriesByVersion.get(guidedVersion.id) ?? [] : [];
    const guidedState = deriveEstimateGuidedState({
      lifecycleStatus: estimate.lifecycleStatus ?? "draft",
      estimateStatus: normalizeEstimateStatus(estimate.status),
      lifecycleOrderId: estimate.lifecycleOrderId ?? null,
      versionId: guidedVersion?.id ?? null,
      versionStatus: guidedVersion?.status ?? null,
      acceptedVersionId: estimate.acceptedVersionId ?? null,
      readyDocumentId: guidedVersion ? documents.get(guidedVersion.id)?.id ?? null : null,
      currentVersion: Boolean(guidedVersion && (
        guidedVersion.estimateRevision === estimate.revision
        || (guidedVersion.status === "sent" && guidedVersion.estimateRevision + 1 === estimate.revision)
      )),
      hasDeliveryHistory: guidedDeliveries.length > 0,
      latestDelivery: guidedDeliveries[0] ? {
        status: guidedDeliveries[0].status,
        openedAt: guidedDeliveries[0].openedAt,
        response: guidedDeliveries[0].response,
      } : null,
      productRequirements: guidedVersion ? versionProductLines(guidedVersion).map((line) => ({ productId: line.productId, quantity: line.quantity })) : [],
      cartConversions,
      companyId,
      userId,
      permissions,
    });
    const readiness = readinessFromAggregate(aggregate);
    const draftReadiness = deriveEstimateDraftReadiness({
      applicable: (estimate.lifecycleStatus ?? "draft") === "draft" && estimate.status === "draft",
      dirty: false,
      estimateRevision: estimate.revision,
      canManage: permissions.canManage,
      lines: aggregate.items.map((item) => ({
        id: item.id,
        position: item.position,
        quantity: item.quantity,
        sellingUnitPrice: item.sellingUnitPrice,
      })),
      currencyCode: estimate.currencyCode,
      totalAmount: estimate.totalAmount,
      hasIncompletePricing: estimate.hasIncompletePricing,
      latestProposal: guidedVersion ? {
        estimateRevision: guidedVersion.estimateRevision,
        status: guidedVersion.status,
        pdfStatus: documents.get(guidedVersion.id)?.status ?? null,
      } : null,
    });
    return {
      estimateId: estimate.id,
      customer: aggregate.finalCustomer ?? null,
      estimateStatus: normalizeEstimateStatus(estimate.status),
      lifecycleStatus: estimate.lifecycleStatus ?? "draft",
      lifecycleExpiresAt: estimate.lifecycleExpiresAt ?? null,
      lifecycleRejectionReason: estimate.lifecycleRejectionReason ?? null,
      lifecycleOrderId: estimate.lifecycleOrderId ?? null,
      acceptedVersionId: estimate.acceptedVersionId ?? null,
      emailDeliveryAvailable: isProposalEmailConfigured(),
      guidedState,
      draftReadiness,
      permissions,
      versions: versions.map((version) => {
        const document = documents.get(version.id);
        return {
          id: version.id,
          estimateNumber: version.estimateNumber,
          versionNumber: version.versionNumber,
          estimateRevision: version.estimateRevision,
          label: `${version.estimateNumber} / версия ${version.versionNumber}`,
          status: version.status,
          statusLabel: versionStatusLabel(version.status),
          total: formatMoney(version.totalAmount, version.currencyCode),
          currencyCode: version.currencyCode,
          note: version.note,
          createdAt: version.createdAt,
          createdByName: version.createdByName ?? "Пользователь компании",
          sentAt: version.sentAt,
          acceptedAt: version.acceptedAt,
          rejectedAt: version.rejectedAt,
          pdfDocumentId: document?.id ?? null,
          pdfStatus: document?.status ?? null,
          deliveries: deliveriesByVersion.get(version.id) ?? [],
          deliveryDefaults: {
            recipientName: version.customerProposalSnapshot.customerName ?? "",
            subject: `Коммерческое предложение ${version.estimateNumber}`,
            message: version.customerProposalSnapshot.projectName ? `Проект: ${version.customerProposalSnapshot.projectName}` : "",
          },
        };
      }),
      readiness,
    };
  }

  async createVersion(userId: string, estimateId: string, expectedRevision: number, requestKey: string, note?: string, changeReason?: string): Promise<EstimateVersion> {
    const startedAt = performance.now();
    const preview = await this.proposalService.preparePreview(userId, estimateId, MANAGE_PERMISSION);
    const previewPreparedAt = performance.now();
    assertReady(readinessFromProposal(preview.proposal).checks);
    const command = {
      estimateId: normalizeId(estimateId), expectedRevision: normalizeRevision(expectedRevision), requestKey: normalizeUuid(requestKey),
      note: normalizeOptional(note, 1000), changeReason: normalizeOptional(changeReason, 1000),
      customerProposalSnapshot: preview.proposal,
    };
    const result = await this.lifecycleRepository.createVersion({
      ...command,
      requestFingerprint: createHash("sha256").update(JSON.stringify(command)).digest("hex"),
    });
    if (result.status === "conflict") throw new EstimateVersionConflictError(result.currentRevision);
    const created = result.version;
    console.info({ event: "estimate_version_created", estimateId, versionId: created.id, versionNumber: created.versionNumber, lineCount: preview.proposal.sections.reduce((sum, section) => sum + section.lines.length, 0), durationMs: Math.round(performance.now() - startedAt), stageMs: { snapshotPreparation: Math.round(previewPreparedAt - startedAt), versionRpc: Math.round(performance.now() - previewPreparedAt) }, deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null });
    return created;
  }

  async markReady(userId: string, estimateId: string, expectedRevision: number): Promise<Estimate> {
    await this.resolveCompany(userId, MANAGE_PERMISSION);
    const readiness = await this.readiness(userId, estimateId);
    assertReady(readiness.checks);
    return this.lifecycleRepository.markReady(normalizeId(estimateId), normalizeRevision(expectedRevision));
  }

  async transitionVersion(userId: string, versionId: string, status: "sent" | "accepted" | "rejected", channel?: EstimateSentChannel | null, note?: string, rejectionReason?: EstimateRejectionReason | null): Promise<EstimateVersion> {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    const version = await this.lifecycleRepository.findVersion(normalizeId(versionId));
    if (!version || version.companyId !== companyId) throw new NotFoundError("Версия сметы не найдена.");
    if (status === "sent" && channel && !(["email", "messenger", "printed", "other"] as const).includes(channel)) throw new InvalidStateError("Выберите способ отправки.");
    if (status === "rejected" && !rejectionReason) throw new InvalidStateError("Выберите причину отклонения.");
    const result = await this.lifecycleRepository.transitionVersion({
      versionId: version.id,
      status,
      channel: channel ?? null,
      note: normalizeOptional(note, 1000),
      ...(status === "rejected" ? { rejectionReason } : {}),
    });
    console.info({ event: `estimate_version_${status}`, estimateId: version.estimateId, versionId: version.id });
    return result;
  }

  async createDraftFromVersion(userId: string, versionId: string): Promise<Estimate> {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    const version = await this.lifecycleRepository.findVersion(normalizeId(versionId));
    if (!version || version.companyId !== companyId) throw new NotFoundError("Версия сметы не найдена.");
    const prices = await this.refreshVersionProductPrices(userId, version);
    return this.lifecycleRepository.restoreDraft(version.id, prices);
  }

  async duplicateEstimate(userId: string, estimateId: string): Promise<Estimate> {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    const estimate = await this.estimateRepository.findById(normalizeId(estimateId));
    if (!estimate || estimate.companyId !== companyId) throw new NotFoundError("Смета не найдена.");
    const startedAt = performance.now();
    const result = await this.lifecycleRepository.duplicate(estimate.id);
    console.info({ event: "estimate_duplicated", sourceEstimateId: estimate.id, estimateId: result.id, durationMs: Math.round(performance.now() - startedAt) });
    return result;
  }

  async saveAsTemplate(userId: string, estimateId: string, name: string, includeServiceLines = false): Promise<ProposalTemplate> {
    await this.resolveCompany(userId, TEMPLATE_PERMISSION);
    const normalizedName = normalizeRequired(name, 120, "Укажите название шаблона.");
    return this.lifecycleRepository.createTemplate({ estimateId: normalizeId(estimateId), name: normalizedName, includeServiceLines });
  }

  async createEstimateFromCart(userId: string, name: string, requestKey: string): Promise<Estimate> {
    await this.resolveCompany(userId, MANAGE_PERMISSION);
    const source = await this.cartService.getEstimateSource(userId);
    const currencyCode = source.lines.find((line) => line.currencyCode)?.currencyCode ?? "USD";
    const needsConversion = source.lines.some((line) => line.currencyCode && line.currencyCode !== currencyCode);
    const rate = needsConversion
      ? await (
          this.pricingInventoryService.getAuthoritativeUsdMdlRateSnapshot?.(
            userId,
          )
          ?? this.pricingInventoryService.getApprovedUsdMdlRateSnapshot?.(userId)
          ?? null
        )
      : null;
    if (needsConversion && !rate) throw new InvalidStateError("Нет опубликованного курса для пересчёта цен.");
    const lines = source.lines.map((line, index) => {
      const exchangeRate = !line.currencyCode || !line.partnerPrice ? null : line.currencyCode === currencyCode ? 1 : resolveCurrencyRate(line.currencyCode, currencyCode, rate!.mdlPerUsdRate);
      return {
        productId: line.productId, position: index + 1, sku: line.sku, productName: line.productName,
        quantity: line.quantity, partnerPrice: line.partnerPrice, currencyCode: line.currencyCode,
        snapshotAt: line.priceUpdatedAt,
        convertedPrice: line.partnerPrice !== null && exchangeRate !== null ? convertMoney(line.partnerPrice, exchangeRate) : null,
        exchangeRate,
        exchangeRateDate: exchangeRate === 1 ? line.priceUpdatedAt?.slice(0, 10) ?? null : rate?.effectiveDate ?? null,
      };
    });
    return this.lifecycleRepository.createFromCart({
      cartId: source.cartId,
      name: normalizeRequired(name, 200, "Укажите название сметы."),
      currencyCode,
      requestKey: normalizeUuid(requestKey),
      lines,
    });
  }

  async addEquipmentToCart(userId: string, estimateId: string, versionId: string | null, requestKey: string): Promise<EstimateCartConversionSummary> {
    const companyId = await this.resolveCompany(userId, CONVERT_PERMISSION);
    const estimate = await this.estimateRepository.findById(normalizeId(estimateId));
    if (!estimate || estimate.companyId !== companyId) throw new NotFoundError("Смета не найдена.");
    let lines: Array<{ productId: string; quantity: number; snapshotPartnerPrice: number | null }>;
    if (versionId) {
      const version = await this.lifecycleRepository.findVersion(normalizeId(versionId));
      if (!version || version.estimateId !== estimate.id || version.companyId !== companyId) throw new NotFoundError("Версия сметы не найдена.");
      lines = versionProductLines(version);
    } else {
      const aggregate = await this.estimateRepository.findAggregateById(estimate.id);
      if (!aggregate) throw new NotFoundError("Смета не найдена.");
      lines = aggregate.items.flatMap((item) => item.lineType === "product" && item.productId
        ? [{ productId: item.productId, quantity: item.quantity, snapshotPartnerPrice: item.sourceUnitPrice }]
        : []);
    }
    const result = await this.cartService.mergeEstimateProducts(userId, {
      estimateId: estimate.id, versionId, requestKey: normalizeUuid(requestKey), lines,
    });
    console.info({ event: "estimate_equipment_added_to_cart", estimateId: estimate.id, versionId, ...result });
    return result;
  }

  private async readiness(userId: string, estimateId: string) {
    const aggregate = await this.estimateRepository.findAggregateById(normalizeId(estimateId));
    if (!aggregate) throw new NotFoundError("Смета не найдена.");
    void userId;
    return readinessFromAggregate(aggregate);
  }

  private async refreshVersionProductPrices(userId: string, version: EstimateVersion): Promise<RefreshedProductPrice[]> {
    const productLines = versionProductLines(version);
    const ids = [...new Set(productLines.map((line) => line.productId))];
    if (!ids.length) return [];
    const [products, views] = await Promise.all([
      this.catalogService.getProductsByIds(userId, ids),
      this.pricingInventoryService.getAuthoritativeProductCommercialViews
        ? this.pricingInventoryService.getAuthoritativeProductCommercialViews(
            userId,
            ids,
          )
        : this.pricingInventoryService.getProductCommercialViews(userId, ids),
    ]);
    const activeIds = new Set(products.map((product) => product.id));
    const viewById = new Map(views.map((view) => [view.productId, view]));
    const needsConversion = views.some((view) => view.partnerPrice?.currencyCode && view.partnerPrice.currencyCode !== version.currencyCode);
    const rate = needsConversion
      ? await (
          this.pricingInventoryService.getAuthoritativeUsdMdlRateSnapshot?.(
            userId,
          )
          ?? this.pricingInventoryService.getApprovedUsdMdlRateSnapshot?.(userId)
          ?? null
        )
      : null;
    return ids.filter((id) => activeIds.has(id)).map((productId) => {
      const price = viewById.get(productId)?.partnerPrice ?? null;
      const exchangeRate = !price?.currencyCode ? null : price.currencyCode === version.currencyCode ? 1 : rate ? resolveCurrencyRate(price.currencyCode, version.currencyCode, rate.mdlPerUsdRate) : null;
      return {
        productId, amount: price?.amount ?? null, currencyCode: price?.currencyCode ?? null,
        snapshotAt: price?.lastUpdatedAt ?? null,
        convertedPrice: price && exchangeRate ? convertMoney(price.amount, exchangeRate) : null,
        exchangeRate,
        exchangeRateDate: exchangeRate === 1 ? price?.lastUpdatedAt?.slice(0, 10) ?? null : rate?.effectiveDate ?? null,
      };
    });
  }

  private async resolveCompany(userId: string, permission: string): Promise<string> {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find((item) => item.status === MembershipStatus.Active);
    const context = await this.companyAccessService.getActiveCompanyContext(userId, membership?.companyId ?? "");
    await this.permissionService.ensurePermission(userId, context.company.id, permission);
    return context.company.id;
  }
}

function summarizeDeliveries(deliveries: ProposalDelivery[]): Map<string, ProposalDeliverySummaryDto[]> {
  const result = new Map<string, ProposalDeliverySummaryDto[]>();
  for (const delivery of deliveries) {
    const rows = result.get(delivery.versionId) ?? [];
    rows.push({
      id: delivery.id,
      recipient: delivery.recipientEmail,
      status: delivery.status,
      statusLabel: deliveryStatusLabel(delivery.status),
      sentAt: delivery.sentAt,
      openedAt: delivery.firstOpenedAt,
      expiresAt: delivery.tokenExpiresAt,
      response: delivery.response,
      failureReason: delivery.status === "failed" ? delivery.safeError : null,
    });
    result.set(delivery.versionId, rows);
  }
  return result;
}

function deliveryStatusLabel(status: ProposalDelivery["status"]) {
  return ({ queued: "В очереди", sending: "Отправляется", sent: "Отправлено", delivered: "Доставлено", failed: "Ошибка отправки", revoked: "Ссылка отозвана", responded: "Клиент ответил" } as const)[status];
}

function readinessFromAggregate(aggregate: NonNullable<Awaited<ReturnType<EstimateRepository["findAggregateById"]>>>) {
  return deriveEstimateReadiness({
    lines: aggregate.items.map((item) => ({ id: item.id, position: item.position, quantity: item.quantity, sellingUnitPrice: item.sellingUnitPrice })),
    currencyCode: aggregate.estimate.currencyCode,
    totalAmount: aggregate.estimate.totalAmount,
    hasIncompletePricing: aggregate.estimate.hasIncompletePricing,
  });
}

function readinessFromProposal(proposal: import("../types").CustomerProposalDto) {
  const lines = proposal.sections.flatMap((section) => section.lines).map((line, index) => ({
    id: `proposal-line-${index + 1}`,
    position: index + 1,
    quantity: line.quantity,
    sellingUnitPrice: Number.isFinite(line.unitPrice) && Number.isFinite(line.lineTotal) ? line.unitPrice : null,
  }));
  return deriveEstimateReadiness({
    lines,
    currencyCode: proposal.currencyCode,
    totalAmount: proposal.totals.total,
    hasIncompletePricing: lines.some((line) => line.sellingUnitPrice === null),
  });
}

function versionProductLines(version: EstimateVersion): Array<{ productId: string; quantity: number; snapshotPartnerPrice: number | null }> {
  return version.snapshot.items.flatMap((item) => item.line_type === "product" && typeof item.product_id === "string"
    ? [{ productId: item.product_id, quantity: Number(item.quantity), snapshotPartnerPrice: nullableNumber(item.source_unit_price) }]
    : []);
}

function nullableNumber(value: unknown): number | null { const number = Number(value); return value === null || value === undefined || !Number.isFinite(number) ? null : number; }
function normalizeEstimateStatus(status: Estimate["status"]): "draft" | "ready" | "archived" { return status === "archived" ? "archived" : status === "draft" ? "draft" : "ready"; }
function versionStatusLabel(status: EstimateVersionStatus): string { return ({ prepared: "Подготовлено", sent: "Отправлено", accepted: "Принято", rejected: "Отклонено", archived: "Архив" } as const)[status]; }
function formatMoney(amount: number, currency: string): string { return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(amount); }
function assertReady(checks: Array<{ label: string; passed: boolean }>) { const failed = checks.filter((check) => !check.passed); if (failed.length) throw new InvalidStateError(`Смета ещё не готова: ${failed.map((check) => check.label).join("; ")}.`); }
function normalizeRevision(value: number): number { if (!Number.isInteger(value) || value < 1) throw new InvalidStateError("Версия данных сметы устарела."); return value; }
function normalizeId(value: string): string { const normalized = value.trim(); if (!normalized) throw new NotFoundError("Запись не найдена."); return normalized; }
function normalizeUuid(value: string): string { const normalized = value.trim().toLowerCase(); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)) throw new InvalidStateError("Ключ операции некорректен."); return normalized; }
function normalizeRequired(value: string, max: number, message: string): string { const normalized = value.trim(); if (!normalized || normalized.length > max) throw new InvalidStateError(message); return normalized; }
function normalizeOptional(value: string | undefined, max: number): string | null { const normalized = value?.trim(); if (!normalized) return null; if (normalized.length > max) throw new InvalidStateError("Текст слишком длинный."); return normalized; }
import { createHash } from "node:crypto";
