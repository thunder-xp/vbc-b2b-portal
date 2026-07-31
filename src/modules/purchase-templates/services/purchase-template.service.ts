import { createHash } from "node:crypto";

import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { InvalidStateError, NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogProductCardDto, CatalogService } from "../../catalog/services";
import type { CartService } from "../../orders/services";
import type { PartnerOrderHistoryRepository } from "../../orders/repositories";
import type { PricingInventoryService, ProductCommercialViewDto } from "../../pricing-inventory/services";
import type { PurchasingListService } from "../../purchasing-lists/services";
import type { PurchaseTemplateIndexRecord, PurchaseTemplateItemInput, PurchaseTemplateRepository } from "../repositories";
import type { PurchaseTemplate, PurchaseTemplateCartResultDto, PurchaseTemplateDetailDto, PurchaseTemplateLineDto, PurchaseTemplateLineState, PurchaseTemplatePageDto, PurchaseTemplatePreviewSummary, PurchaseTemplateSourceType, PurchaseTemplateVisibility } from "../types";

const PAGE_SIZE = 20;
const MAX_ITEMS = 200;
const VIEW_PERMISSION = "purchase_templates.view";
const CREATE_PERMISSION = "purchase_templates.create";
const USE_PERMISSION = "purchase_templates.use";

export class PurchaseTemplateService {
  constructor(
    private readonly repository: PurchaseTemplateRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
    private readonly catalogService: CatalogService,
    private readonly pricingInventoryService: PricingInventoryService,
    private readonly cartService?: CartService,
    private readonly orderHistoryRepository?: PartnerOrderHistoryRepository,
    private readonly purchasingListService?: PurchasingListService,
  ) {}

  async list(userId: string, input: { search?: string; filter?: "all" | "mine" | "company" | "active" | "archived"; page?: number } = {}): Promise<PurchaseTemplatePageDto> {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    const page = normalizePage(input.page);
    const result = await this.repository.list({ companyId, search: normalizeOptional(input.search, 100), filter: normalizeFilter(input.filter), limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
    const allProductIds = [...new Set(result.records.flatMap((record) => record.productIds))];
    const [products, commercial, visibility] = await Promise.all([
      this.catalogService.getProductsByIds(userId, allProductIds),
      this.pricingInventoryService.getProductCommercialViews(userId, allProductIds),
      this.pricingInventoryService.getCommercialVisibility?.(userId) ?? Promise.resolve(null),
    ]);
    const productById = new Map(products.map((product) => [product.id, product]));
    const commercialById = new Map(commercial.map((view) => [view.productId, view]));
    const [canEditOwn, canEditCompany] = await Promise.all([
      this.permissionService.hasPermission(userId, companyId, "purchase_templates.edit_own"),
      this.permissionService.hasPermission(userId, companyId, "purchase_templates.edit_company"),
    ]);
    return {
      records: result.records.map((record) => {
        const lines = record.itemIntents.map((intent, index) => toLine({ id: `${record.id}:${intent.productId}`, templateId: record.id, productId: intent.productId, preferredQuantity: intent.quantity, lineNote: null, sortOrder: index + 1, createdAt: record.createdAt, updatedAt: record.updatedAt }, productById.get(intent.productId), commercialById.get(intent.productId), visibility?.mode ?? "full"));
        const summary = summarize(lines);
        return { ...withoutIndexProjection(record), warningCount: warningCount(lines), totals: summary.totals, canEdit: canEdit(record, userId, canEditOwn, canEditCompany) };
      }),
      page,
      totalPages: Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE)),
      totalCount: result.totalCount,
    };
  }

  async getDetail(userId: string, templateId: string): Promise<PurchaseTemplateDetailDto> {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    const record = await this.repository.findById(requireUuid(templateId));
    if (!record || record.companyId !== companyId) throw new NotFoundError("Purchase template was not found.");
    const productIds = record.items.map((item) => item.productId);
    const [products, commercial, visibility, canEditOwn, canEditCompany] = await Promise.all([
      this.catalogService.getProductsByIds(userId, productIds),
      this.pricingInventoryService.getProductCommercialViews(userId, productIds),
      this.pricingInventoryService.getCommercialVisibility?.(userId) ?? Promise.resolve(null),
      this.permissionService.hasPermission(userId, companyId, "purchase_templates.edit_own"),
      this.permissionService.hasPermission(userId, companyId, "purchase_templates.edit_company"),
    ]);
    const productById = new Map(products.map((product) => [product.id, product]));
    const commercialById = new Map(commercial.map((view) => [view.productId, view]));
    const lines = record.items.map((item) => toLine(item, productById.get(item.productId), commercialById.get(item.productId), visibility?.mode ?? "full"));
    return { ...withoutItems(record), canEdit: canEdit(record, userId, canEditOwn, canEditCompany), lines, summary: summarize(lines) };
  }

  async createManual(userId: string, input: TemplateMetadata & { requestKey: string }) {
    return this.create(userId, { ...input, sourceType: "manual", sourceId: null, items: [] });
  }

  async createFromCart(userId: string, input: TemplateMetadata & { requestKey: string }) {
    if (!this.cartService) throw new InvalidStateError("Cart template creation is unavailable.");
    const companyId = await this.resolveCompany(userId, CREATE_PERMISSION);
    const source = await this.cartService.getEstimateSource(userId);
    if (source.companyId !== companyId || !source.lines.length) throw new InvalidStateError("The active cart is empty.");
    return this.create(userId, { ...input, sourceType: "cart", sourceId: source.cartId, items: source.lines.map((line, index) => ({ productId: line.productId, preferredQuantity: line.quantity, lineNote: null, sortOrder: index + 1 })) }, companyId);
  }

  async createFromOrder(userId: string, input: TemplateMetadata & { requestKey: string; orderId: string }) {
    if (!this.orderHistoryRepository) throw new InvalidStateError("Order template creation is unavailable.");
    const companyId = await this.resolveCompany(userId, CREATE_PERMISSION);
    await this.permissionService.ensurePermission(userId, companyId, "orders.view");
    const source = await this.orderHistoryRepository.getReorderSource(requireUuid(input.orderId));
    if (!source || source.companyId !== companyId) throw new NotFoundError("Order was not found.");
    const items = source.lines.flatMap((line, index) => line.productId ? [{ productId: line.productId, preferredQuantity: normalizeQuantity(line.historicalQuantity), lineNote: null, sortOrder: index + 1 }] : []);
    if (!items.length) throw new InvalidStateError("The order has no linked catalog products.");
    return this.create(userId, { ...input, sourceType: "order", sourceId: source.orderId, items }, companyId);
  }

  async createFromPurchasingList(userId: string, input: TemplateMetadata & { requestKey: string; listId: string }) {
    if (!this.purchasingListService) throw new InvalidStateError("Purchasing-list template creation is unavailable.");
    const companyId = await this.resolveCompany(userId, CREATE_PERMISSION);
    const source = await this.purchasingListService.getDetail(userId, requireUuid(input.listId));
    if (!source.lines.length) throw new InvalidStateError("The purchasing list is empty.");
    return this.create(userId, { ...input, sourceType: "purchasing_list", sourceId: source.id, items: source.lines.map((line, index) => ({ productId: line.productId, preferredQuantity: line.quantity, lineNote: line.note, sortOrder: index + 1 })) }, companyId);
  }

  async createFromDashboardReorder(userId: string, input: { requestKey: string; items: Array<{ productId: string; quantity: number }> }) {
    const companyId = await this.resolveCompany(userId, CREATE_PERMISSION);
    const items = normalizeItems(input.items.map((item, index) => ({ productId: item.productId, preferredQuantity: item.quantity, lineNote: null, sortOrder: index + 1 })));
    if (!items.length || items.length > 4) throw new InvalidStateError("Dashboard template selection is invalid.");
    const products = await this.catalogService.getProductsByIds(userId, items.map((item) => item.productId));
    if (products.length !== items.length) throw new NotFoundError("A selected product is unavailable.");
    return this.create(userId, { name: "Вы покупали ранее", description: "Товары из блока повторных закупок", visibility: "private", requestKey: input.requestKey, sourceType: "dashboard_reorder", sourceId: null, items }, companyId);
  }

  async update(userId: string, input: { templateId: string; expectedRevision: number; name: string; description?: string | null; visibility: PurchaseTemplateVisibility; items: PurchaseTemplateItemInput[] }) {
    const detail = await this.getDetail(userId, input.templateId);
    if (!detail.canEdit || detail.status !== "active") throw new InvalidStateError("Purchase template cannot be changed.");
    if (detail.revision !== input.expectedRevision) throw new InvalidStateError("Purchase template changed. Reload it.");
    const items = normalizeItems(input.items);
    if (items.length) {
      const products = await this.catalogService.getProductsByIds(userId, items.map((item) => item.productId));
      if (products.length !== new Set(items.map((item) => item.productId)).size) throw new NotFoundError("A selected product is unavailable.");
    }
    return this.repository.update({ templateId: detail.id, expectedRevision: input.expectedRevision, ...normalizeMetadata(input), items });
  }

  async copy(userId: string, templateId: string, requestKey: string) {
    const detail = await this.getDetail(userId, templateId);
    await this.resolveCompany(userId, CREATE_PERMISSION);
    const key = requireUuid(requestKey);
    const name = normalizeRequired(`${detail.name} — копия`, 120);
    return this.repository.copy({ templateId: detail.id, name, requestKey: key, requestFingerprint: fingerprint([detail.id, name]) });
  }

  async archive(userId: string, templateId: string, expectedRevision: number) {
    const detail = await this.getDetail(userId, templateId);
    await this.permissionService.ensurePermission(userId, detail.companyId, "purchase_templates.archive");
    if (!detail.canEdit || detail.revision !== expectedRevision) throw new InvalidStateError("Purchase template cannot be archived.");
    return this.repository.archive(detail.id, expectedRevision);
  }

  async addToCart(userId: string, input: { templateId: string; requestKey: string; multiplier: number; selections?: Array<{ itemId: string; quantity: number }> }): Promise<PurchaseTemplateCartResultDto> {
    const detail = await this.getDetail(userId, input.templateId);
    await this.permissionService.ensurePermission(userId, detail.companyId, USE_PERMISSION);
    if (detail.status !== "active") throw new InvalidStateError("Archived template cannot be used.");
    const multiplier = normalizeMultiplier(input.multiplier);
    const selected = input.selections?.length ? new Map(input.selections.map((item) => [requireUuid(item.itemId), normalizeQuantity(item.quantity)])) : null;
    const chosen = detail.lines.filter((line) => !selected || selected.has(line.id));
    if (!chosen.length) throw new InvalidStateError("Select at least one product.");
    const executable = chosen.flatMap((line) => {
      if (!line.eligible) return [];
      const quantity = selected?.get(line.id) ?? normalizeQuantity(line.preferredQuantity * multiplier);
      return [{ itemId: line.id, productId: line.productId, quantity }];
    });
    const summary = {
      skipped: chosen.length - executable.length,
      unavailable: chosen.filter((line) => line.state === "unavailable").length,
      restricted: chosen.filter((line) => line.state === "access_restricted" || line.state === "unpublished").length,
      failed: 0,
    };
    if (!executable.length) return { repeated: false, cartId: null, added: 0, merged: 0, ...summary };
    const requestKey = requireUuid(input.requestKey);
    const result = await this.repository.mergeIntoCart({ templateId: detail.id, requestKey, requestFingerprint: fingerprint([detail.id, ...executable.map((item) => `${item.itemId}:${item.quantity}`).sort()]), items: executable, summary });
    return { repeated: result.repeated, cartId: result.cartId, added: executable.length, merged: executable.length, ...summary };
  }

  private async create(userId: string, input: TemplateMetadata & { sourceType: PurchaseTemplateSourceType; sourceId: string | null; requestKey: string; items: PurchaseTemplateItemInput[] }, resolvedCompanyId?: string): Promise<PurchaseTemplate> {
    const companyId = resolvedCompanyId ?? await this.resolveCompany(userId, CREATE_PERMISSION);
    const metadata = normalizeMetadata(input);
    const items = normalizeItems(input.items);
    const requestKey = requireUuid(input.requestKey);
    const sourceId = input.sourceId ? requireUuid(input.sourceId) : null;
    return this.repository.create({ companyId, ...metadata, sourceType: input.sourceType, sourceId, requestKey, requestFingerprint: fingerprint([companyId, metadata.name, metadata.visibility, input.sourceType, sourceId ?? "", ...items.map((item) => `${item.productId}:${item.preferredQuantity}:${item.lineNote ?? ""}`).sort()]), items });
  }

  private async resolveCompany(userId: string, permission: string) {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find((item) => item.status === MembershipStatus.Active);
    const context = await this.companyAccessService.getActiveCompanyContext(userId, membership?.companyId ?? "");
    await this.permissionService.ensurePermission(userId, context.company.id, permission);
    return context.company.id;
  }
}

type TemplateMetadata = { name: string; description?: string | null; visibility: PurchaseTemplateVisibility };

function toLine(item: PurchaseTemplateDetailDto["lines"][number] | { id: string; templateId: string; productId: string; preferredQuantity: number; lineNote: string | null; sortOrder: number; createdAt: string; updatedAt: string }, product: CatalogProductCardDto | undefined, view: ProductCommercialViewDto | undefined, commercialMode: "full" | "retail_only" | "hidden"): PurchaseTemplateLineDto {
  const selectedPrice = commercialMode === "retail_only" ? view?.retailPrice : commercialMode === "full" ? view?.partnerPrice : null;
  const state = classifyState(product, view, item.preferredQuantity, commercialMode, selectedPrice?.amount ?? null);
  const amount = selectedPrice?.amount ?? null;
  return {
    ...item,
    sku: product?.sku ?? null,
    productName: product?.name ?? null,
    slug: product?.slug ?? null,
    imageUrl: product?.imageUrl ?? null,
    currentUnitPrice: selectedPrice?.formattedAmount ?? null,
    currentUnitPriceAmount: amount,
    currentCurrencyCode: selectedPrice?.currencyCode ?? null,
    lineTotal: amount !== null && selectedPrice?.currencyCode ? formatMoney(amount * item.preferredQuantity, selectedPrice.currencyCode) : null,
    availableQuantity: view?.stock?.exactAvailableQuantity ?? null,
    expectedArrivalDate: view?.stock?.expectedArrival?.expectedDate ?? null,
    expectedArrivalQuantity: view?.stock?.expectedArrival?.expectedQuantity ?? null,
    state,
    stateLabel: STATE_LABELS[state],
    eligible: ["available", "low_stock", "quantity_exceeds_available", "expected"].includes(state),
  };
}

function classifyState(product: CatalogProductCardDto | undefined, view: ProductCommercialViewDto | undefined, quantity: number, mode: string, price: number | null): PurchaseTemplateLineState {
  if (!product) return view ? "access_restricted" : "unpublished";
  if (mode === "hidden") return "access_restricted";
  if (price === null || !Number.isFinite(price) || price < 0) return "price_unavailable";
  const available = view?.stock?.exactAvailableQuantity;
  if (available === null || available === undefined) return "unavailable";
  if (available <= 0) return view?.stock?.expectedArrival ? "expected" : "unavailable";
  if (quantity > available) return "quantity_exceeds_available";
  return available <= 5 ? "low_stock" : "available";
}

const STATE_LABELS: Record<PurchaseTemplateLineState, string> = {
  available: "В наличии",
  low_stock: "Низкий остаток",
  quantity_exceeds_available: "Количество превышает остаток",
  unavailable: "Нет в наличии",
  expected: "Ожидается к поступлению",
  price_unavailable: "Цена уточняется",
  unpublished: "Товар снят с публикации",
  access_restricted: "Доступ к товару ограничен",
};

function summarize(lines: PurchaseTemplateLineDto[]): PurchaseTemplatePreviewSummary {
  const totals = new Map<string, number>();
  for (const line of lines) if (line.currentCurrencyCode && line.currentUnitPriceAmount !== null) totals.set(line.currentCurrencyCode, (totals.get(line.currentCurrencyCode) ?? 0) + line.currentUnitPriceAmount * line.preferredQuantity);
  return {
    totalPositions: lines.length,
    eligible: lines.filter((line) => line.eligible).length,
    unavailable: lines.filter((line) => line.state === "unavailable").length,
    expected: lines.filter((line) => line.state === "expected").length,
    unpublished: lines.filter((line) => line.state === "unpublished").length,
    restricted: lines.filter((line) => line.state === "access_restricted").length,
    priceUnavailable: lines.filter((line) => line.state === "price_unavailable").length,
    quantityExceedsStock: lines.filter((line) => line.state === "quantity_exceeds_available").length,
    totals: [...totals].sort(([left], [right]) => left.localeCompare(right)).map(([currencyCode, amount]) => ({ currencyCode, amount, formatted: formatMoney(amount, currencyCode) })),
  };
}

function warningCount(lines: PurchaseTemplateLineDto[]) { return lines.filter((line) => line.state !== "available").length; }
function canEdit(record: PurchaseTemplateIndexRecord | { ownerUserId: string; visibility: PurchaseTemplateVisibility; status: string }, userId: string, own: boolean, company: boolean) { return record.status === "active" && ((record.ownerUserId === userId && own) || (record.visibility === "company" && company)); }
function normalizeItems(items: PurchaseTemplateItemInput[]) {
  if (items.length > MAX_ITEMS) throw new InvalidStateError("A template may contain no more than 200 products.");
  const grouped = new Map<string, PurchaseTemplateItemInput>();
  for (const item of items) {
    const productId = requireUuid(item.productId);
    const quantity = normalizeQuantity(item.preferredQuantity);
    const existing = grouped.get(productId);
    grouped.set(productId, { productId, preferredQuantity: Math.min(9999, (existing?.preferredQuantity ?? 0) + quantity), lineNote: normalizeOptional(existing?.lineNote ?? item.lineNote, 500), sortOrder: existing?.sortOrder ?? normalizeSortOrder(item.sortOrder) });
  }
  return [...grouped.values()].sort((a, b) => a.sortOrder - b.sortOrder).map((item, index) => ({ ...item, sortOrder: index + 1 }));
}
function normalizeMetadata(input: TemplateMetadata) { return { name: normalizeRequired(input.name, 120), description: normalizeOptional(input.description, 1000), visibility: normalizeVisibility(input.visibility) }; }
function normalizeVisibility(value: string): PurchaseTemplateVisibility { if (value !== "private" && value !== "company") throw new InvalidStateError("Choose template visibility."); return value; }
function normalizeRequired(value: string, max: number) { const normalized = value.trim().replace(/\s+/g, " "); if (!normalized || normalized.length > max) throw new InvalidStateError("Check the template name."); return normalized; }
function normalizeOptional(value: string | null | undefined, max: number) { const normalized = value?.trim().replace(/\s+/g, " ") ?? ""; if (normalized.length > max) throw new InvalidStateError("Text is too long."); return normalized || null; }
function normalizeQuantity(value: number) { if (!Number.isInteger(value) || value < 1 || value > 9999) throw new InvalidStateError("Quantity must be a whole number between 1 and 9999."); return value; }
function normalizeSortOrder(value: number) { if (!Number.isInteger(value) || value < 1 || value > MAX_ITEMS) throw new InvalidStateError("Line order is invalid."); return value; }
function normalizeMultiplier(value: number) { if (![0.5, 1, 2, 3].includes(value)) throw new InvalidStateError("Quantity multiplier is invalid."); return value; }
function normalizePage(value?: number) { return Number.isInteger(value) && value! > 0 ? value! : 1; }
function normalizeFilter(value?: string): "all" | "mine" | "company" | "active" | "archived" { return (["mine", "company", "active", "archived"] as const).includes(value as never) ? value as never : "all"; }
function requireUuid(value: string) { const normalized = value.trim().toLowerCase(); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) throw new InvalidStateError("Identifier is invalid."); return normalized; }
function fingerprint(parts: string[]) { return createHash("sha256").update(parts.join("|")).digest("hex"); }
function formatMoney(amount: number, currency: string) { try { return new Intl.NumberFormat("ru-RU", { style: "currency", currency, minimumFractionDigits: 2 }).format(amount); } catch { return `${amount.toFixed(2)} ${currency}`; } }
function withoutItems<T extends { items: unknown }>(record: T): Omit<T, "items"> { const { items, ...rest } = record; void items; return rest; }
function withoutIndexProjection(record: PurchaseTemplateIndexRecord) { const { productIds, itemIntents, ...rest } = record; void productIds; void itemIntents; return rest; }
