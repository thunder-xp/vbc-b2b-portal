import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { InvalidStateError, NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogService } from "../../catalog/services";
import type { CartService } from "../../orders/services";
import type { PricingInventoryService } from "../../pricing-inventory/services";
import type { EstimateLifecycleRepository, EstimateRepository, ProposalDeliveryRepository, RefreshedProductPrice } from "../repositories";
import type {
  Estimate,
  EstimateCartConversionSummary,
  EstimateSentChannel,
  EstimateVersion,
  EstimateVersionStatus,
  EstimateWorkflowDto,
  ProposalDelivery,
  ProposalDeliverySummaryDto,
  ProposalTemplate,
} from "../types";
import { convertMoney, resolveCurrencyRate } from "./commercial-calculation";
import type { DefaultProposalService } from "./proposal.service";

const VIEW_PERMISSION = "estimates.view";
const MANAGE_PERMISSION = "estimates.manage";
const TEMPLATE_PERMISSION = "proposal_templates.manage";
const CONVERT_PERMISSION = "estimates.convert_to_cart";

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
    const [documents, deliveries] = await Promise.all([
      this.lifecycleRepository.listLatestDocuments(versionIds),
      this.deliveryRepository.listByVersionIds(versionIds),
    ]);
    const deliveriesByVersion = summarizeDeliveries(deliveries);
    return {
      estimateId: estimate.id,
      estimateStatus: normalizeEstimateStatus(estimate.status),
      acceptedVersionId: estimate.acceptedVersionId ?? null,
      versions: versions.map((version) => {
        const document = documents.get(version.id);
        return {
          id: version.id,
          versionNumber: version.versionNumber,
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
      readiness: readinessFromAggregate(aggregate),
    };
  }

  async createVersion(userId: string, estimateId: string, expectedRevision: number, note?: string, changeReason?: string): Promise<EstimateVersion> {
    await this.resolveCompany(userId, MANAGE_PERMISSION);
    const startedAt = performance.now();
    const preview = await this.proposalService.preparePreview(userId, estimateId);
    assertReady(readinessFromProposal(preview.proposal).checks);
    const created = await this.lifecycleRepository.createVersion({
      estimateId: normalizeId(estimateId), expectedRevision: normalizeRevision(expectedRevision),
      note: normalizeOptional(note, 1000), changeReason: normalizeOptional(changeReason, 1000),
      customerProposalSnapshot: preview.proposal,
    });
    console.info({ event: "estimate_version_created", estimateId, versionId: created.id, versionNumber: created.versionNumber, lineCount: preview.proposal.sections.reduce((sum, section) => sum + section.lines.length, 0), durationMs: Math.round(performance.now() - startedAt) });
    return created;
  }

  async markReady(userId: string, estimateId: string, expectedRevision: number): Promise<Estimate> {
    await this.resolveCompany(userId, MANAGE_PERMISSION);
    const readiness = await this.readiness(userId, estimateId);
    assertReady(readiness.checks);
    return this.lifecycleRepository.markReady(normalizeId(estimateId), normalizeRevision(expectedRevision));
  }

  async transitionVersion(userId: string, versionId: string, status: "sent" | "accepted" | "rejected", channel?: EstimateSentChannel | null, note?: string): Promise<EstimateVersion> {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    const version = await this.lifecycleRepository.findVersion(normalizeId(versionId));
    if (!version || version.companyId !== companyId) throw new NotFoundError("Версия сметы не найдена.");
    if (status === "sent" && channel && !(["email", "messenger", "printed", "other"] as const).includes(channel)) throw new InvalidStateError("Выберите способ отправки.");
    const result = await this.lifecycleRepository.transitionVersion({ versionId: version.id, status, channel: channel ?? null, note: normalizeOptional(note, 1000) });
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
    const rate = needsConversion ? await this.pricingInventoryService.getApprovedUsdMdlRateSnapshot?.(userId) ?? null : null;
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
      this.pricingInventoryService.getProductCommercialViews(userId, ids),
    ]);
    const activeIds = new Set(products.map((product) => product.id));
    const viewById = new Map(views.map((view) => [view.productId, view]));
    const needsConversion = views.some((view) => view.partnerPrice?.currencyCode && view.partnerPrice.currencyCode !== version.currencyCode);
    const rate = needsConversion ? await this.pricingInventoryService.getApprovedUsdMdlRateSnapshot?.(userId) ?? null : null;
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
    });
    result.set(delivery.versionId, rows);
  }
  return result;
}

function deliveryStatusLabel(status: ProposalDelivery["status"]) {
  return ({ queued: "В очереди", sending: "Отправляется", sent: "Отправлено", delivered: "Доставлено", failed: "Ошибка отправки", revoked: "Ссылка отозвана", responded: "Клиент ответил" } as const)[status];
}

function readinessFromAggregate(aggregate: NonNullable<Awaited<ReturnType<EstimateRepository["findAggregateById"]>>>) {
  const settings = aggregate.estimate.proposalSettings ?? {};
  const checks = [
    { label: "Добавлена хотя бы одна позиция", passed: aggregate.items.length > 0 },
    { label: "Для всех позиций указаны цены", passed: !aggregate.estimate.hasIncompletePricing && aggregate.items.every((item) => item.sellingUnitPrice !== null) },
    { label: "Валюта сметы определена", passed: /^[A-Z]{3}$/.test(aggregate.estimate.currencyCode) },
    { label: "Итоговая сумма рассчитана", passed: Number.isFinite(aggregate.estimate.totalAmount) && aggregate.estimate.totalAmount >= 0 },
    { label: "Заполнены условия оплаты", passed: typeof settings.paymentTerms === "string" ? settings.paymentTerms.trim().length > 0 : true },
    { label: "Заполнены условия поставки", passed: typeof settings.deliveryTerms === "string" ? settings.deliveryTerms.trim().length > 0 : true },
  ];
  return { ready: checks.every((check) => check.passed), checks };
}

function readinessFromProposal(proposal: import("../types").CustomerProposalDto) {
  const lines = proposal.sections.flatMap((section) => section.lines);
  const checks = [
    { label: "Добавлена хотя бы одна позиция", passed: lines.length > 0 },
    { label: "Для всех позиций указаны цены", passed: lines.every((line) => Number.isFinite(line.unitPrice) && Number.isFinite(line.lineTotal)) },
    { label: "Валюта сметы определена", passed: /^[A-Z]{3}$/.test(proposal.currencyCode) },
    { label: "Итоговая сумма рассчитана", passed: Number.isFinite(proposal.totals.total) && proposal.totals.total >= 0 },
    { label: "Заполнены условия оплаты", passed: proposal.settings.paymentTerms.trim().length > 0 },
    { label: "Заполнены условия поставки", passed: proposal.settings.deliveryTerms.trim().length > 0 },
  ];
  return { ready: checks.every((check) => check.passed), checks };
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
