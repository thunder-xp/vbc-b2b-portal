import { createHash } from "node:crypto";

import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { DomainConflictError, InvalidStateError, NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogService } from "../../catalog/services";
import { toLiveCommerceSelectionProduct } from "../../catalog/services/live-commerce-selection";
import type { CartService } from "../../orders/services";
import type { PartnerOrderHistoryRepository } from "../../orders/repositories";
import { classifyCommercialProductState, commercialProductStateLabels, type PricingInventoryService } from "../../pricing-inventory/services";
import { PurchasingListRepositoryError, type PurchasingListRepository } from "../repositories";
import type { LiveCommerceKitBatchDto, LiveCommerceKitDetailDto, LiveCommerceKitLineDto, LiveCommerceKitSummaryDto, PurchasingList, PurchasingListConversionResultDto, PurchasingListDetailDto, PurchasingListPageDto, PurchasingListVisibility } from "../types";

const VIEW_PERMISSION = "purchasing_lists.view";
const MANAGE_PERMISSION = "purchasing_lists.manage";
const PAGE_SIZE = 20;
const MAX_ITEMS = 200;
const MAX_FAVORITE_PROJECTION = 100;
const LIVE_COMMERCE_KIT_LIMIT = 3;
const LIVE_COMMERCE_SELECTION_LIMIT = 50;

export interface PurchasingListEstimateGateway {
  createFromPurchasingList(userId: string, input: {
    listId: string;
    name: string;
    requestKey: string;
    items: Array<{ itemId: string; productId: string; quantity: number }>;
  }): Promise<{ estimateId: string; repeated: boolean; added: number; skipped: number }>;
}

export class PurchasingListService {
  constructor(
    private readonly repository: PurchasingListRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
    private readonly catalogService: CatalogService,
    private readonly pricingInventoryService: PricingInventoryService,
    private readonly cartService?: CartService,
    private readonly orderHistoryRepository?: PartnerOrderHistoryRepository,
    private readonly estimateGateway?: PurchasingListEstimateGateway,
  ) {}

  async list(userId: string, input: { search?: string; filter?: "all" | "private" | "company" | "mine" | "archived"; page?: number } = {}): Promise<PurchasingListPageDto> {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    const page = normalizePage(input.page);
    const filter = normalizeFilter(input.filter);
    const result = await this.repository.list({ companyId, search: normalizeOptional(input.search, 100), visibility: filter === "private" || filter === "company" ? filter : null, mine: filter === "mine", archived: filter === "archived", limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
    const productIds = [...new Set(result.records.flatMap((record) => record.productIds))];
    const [products, commercial, canManage] = await Promise.all([
      this.catalogService.getProductsByIds(userId, productIds),
      this.pricingInventoryService.getProductCommercialViews(userId, productIds),
      this.permissionService.hasPermission(userId, companyId, MANAGE_PERMISSION),
    ]);
    const productSet = new Set(products.map((product) => product.id));
    const commercialById = new Map(commercial.map((view) => [view.productId, view]));
    return {
      records: result.records.map((record) => ({
        ...withoutProductIds(record),
        warningCount: record.productIds.filter((productId) => {
          const productExists = productSet.has(productId);
          const commercialView = commercialById.get(productId);
          if (productExists && !commercialView?.partnerPrice && commercialView?.retailPrice) {
            return (commercialView.stock?.exactAvailableQuantity ?? 0) <= 0;
          }
          return classifyCommercialProductState({
            productExists,
            commercial: commercialView,
          }) !== "available";
        }).length,
        canManage: !record.isSystemFavorites && canManage && (record.visibility === "company" || record.createdBy === userId),
      })),
      page,
      totalPages: Math.max(1, Math.ceil(result.totalCount / PAGE_SIZE)),
      totalCount: result.totalCount,
    };
  }

  async listManageableChoices(userId: string): Promise<Array<{ id: string; name: string; revision: number }>> {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    const result = await this.repository.list({ companyId, search: null, visibility: null, mine: false, archived: false, limit: 100, offset: 0 });
    return result.records.filter((record) => !record.isSystemFavorites && (record.visibility === "company" || record.createdBy === userId)).map(({ id, name, revision }) => ({ id, name, revision }));
  }

  async listLiveCommerceKits(userId: string): Promise<LiveCommerceKitSummaryDto[]> {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    await this.permissionService.ensurePermission(userId, companyId, "catalog.view");
    const [result, canManage] = await Promise.all([
      measureLiveCommerceKitStage("summary_list", () => this.repository.list({
        companyId,
        search: null,
        visibility: null,
        mine: false,
        archived: false,
        limit: LIVE_COMMERCE_KIT_LIMIT + 1,
        offset: 0,
      })),
      this.permissionService.hasPermission(userId, companyId, MANAGE_PERMISSION),
    ]);
    return result.records
      .filter((record) => !record.isSystemFavorites)
      .slice(0, LIVE_COMMERCE_KIT_LIMIT)
      .map((record) => ({
        id: record.id,
        name: record.name,
        itemCount: record.itemCount,
        totalQuantity: record.totalQuantity,
        updatedAt: record.updatedAt,
        revision: record.revision,
        canManage: canManage && (record.visibility === "company" || record.createdBy === userId),
      }));
  }

  async createFromLiveCommerceSelection(userId: string, input: {
    name: string;
    items: Array<{ productId: string; quantity: number }>;
  }) {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    await this.permissionService.ensurePermission(userId, companyId, "catalog.view");
    const name = normalizeRequired(input.name, 120);
    const items = normalizeLiveCommerceProducts(input.items);
    const products = await measureLiveCommerceKitStage("save_catalog_validation", () =>
      this.catalogService.getProductsByIds(userId, items.map((item) => item.productId)),
    );
    const visibleIds = new Set(products.map((product) => product.id));
    const validItems = items.filter((item) => visibleIds.has(item.productId));
    if (!validItems.length) throw new InvalidStateError("No current catalog products can be saved.");
    const list = await measureLiveCommerceKitStage("save_mutation", () => this.repository.create({
      companyId,
      name,
      description: null,
      visibility: "private",
      sourceType: "manual",
      sourceReferenceId: null,
      items: validItems,
    }));
    return { list, saved: validItems.length, skipped: items.length - validItems.length };
  }

  async getLiveCommerceKit(userId: string, listId: string): Promise<LiveCommerceKitDetailDto> {
    return this.loadLiveCommerceKit(userId, listId, false);
  }

  async prepareLiveCommerceKitSelection(userId: string, input: {
    listId: string;
    items: Array<{ itemId: string; quantity: number }>;
  }): Promise<LiveCommerceKitBatchDto> {
    const selected = normalizeKitItems(input.items);
    const detail = await this.loadLiveCommerceKit(userId, input.listId, true);
    const byItemId = new Map(detail.lines.map((line) => [line.itemId, line]));
    if (selected.some((item) => !byItemId.has(item.itemId))) throw new NotFoundError("Kit product was not found.");
    const items = selected.flatMap(({ itemId, quantity }) => {
      const line = byItemId.get(itemId)!;
      return line.status === "READY" && line.product ? [{ product: line.product, quantity }] : [];
    });
    return { items, readyCount: items.length, attentionCount: selected.length - items.length };
  }

  async updateLiveCommerceKit(userId: string, input: {
    listId: string;
    expectedRevision: number;
    items: Array<{ itemId: string; quantity: number }>;
  }) {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    const record = await this.repository.findById(requireUuid(input.listId));
    if (!record || record.companyId !== companyId) throw new NotFoundError("Purchasing list was not found.");
    if (record.isSystemFavorites || record.archivedAt || (record.visibility === "private" && record.createdBy !== userId)) {
      throw new InvalidStateError("Purchasing list cannot be changed.");
    }
    if (record.revision !== input.expectedRevision) throw new InvalidStateError("Purchasing list changed. Reload it.");
    const selected = normalizeKitItems(input.items);
    const byId = new Map(selected.map((item) => [item.itemId, item.quantity]));
    if (record.items.length !== selected.length || record.items.some((item) => !byId.has(item.id))) {
      throw new NotFoundError("Kit product was not found.");
    }
    return listMutation(() => this.repository.updateItems({
      listId: record.id,
      expectedRevision: record.revision,
      items: record.items.map((item) => ({
        itemId: item.id,
        quantity: byId.get(item.id)!,
        position: item.position,
        note: item.note,
      })),
    }));
  }

  async listFavoriteProductIds(userId: string, productIds: string[]): Promise<string[]> {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    const normalized = [...new Set(productIds.map(requireUuid))];
    if (!normalized.length) return [];
    if (normalized.length > MAX_FAVORITE_PROJECTION) throw new InvalidStateError("Favorite query is too large.");
    return this.repository.listFavoriteProductIds(companyId, normalized);
  }

  async setFavorite(userId: string, productId: string, saved: boolean) {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    const normalizedProductId = requireUuid(productId);
    if (!(await this.catalogService.getProductsByIds(userId, [normalizedProductId])).length) throw new NotFoundError("Product was not found.");
    return this.repository.setFavorite(companyId, normalizedProductId, saved);
  }

  async getDetail(userId: string, listId: string): Promise<PurchasingListDetailDto> {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    const record = await this.repository.findById(requireUuid(listId));
    if (!record || record.companyId !== companyId) throw new NotFoundError("Purchasing list was not found.");
    const productIds = record.items.map((item) => item.productId);
    const [products, commercial, canManage] = await Promise.all([
      this.catalogService.getProductsByIds(userId, productIds),
      this.pricingInventoryService.getProductCommercialViews(userId, productIds),
      this.permissionService.hasPermission(userId, companyId, MANAGE_PERMISSION),
    ]);
    const productById = new Map(products.map((product) => [product.id, product]));
    const commercialById = new Map(commercial.map((view) => [view.productId, view]));
    return {
      ...withoutItems(record),
      canManage: !record.isSystemFavorites && canManage && (record.visibility === "company" || record.createdBy === userId),
      lines: record.items.map((item) => {
        const product = productById.get(item.productId);
        const view = commercialById.get(item.productId);
        const state = view?.partnerPrice
          ? classifyCommercialProductState({
              productExists: Boolean(product),
              commercial: view,
              sourceUnitPrice: item.sourceUnitPrice,
              sourceCurrencyCode: item.sourceCurrencyCode,
            })
          : product && view?.retailPrice
            ? "available"
            : "missing_price";
        const {
          sourceUnitPrice: _sourceUnitPrice,
          sourceCurrencyCode: _sourceCurrencyCode,
          ...safeItem
        } = item;
        return {
          ...safeItem,
          sku: product?.sku ?? "Без артикула",
          productName: product?.name ?? item.productNameSnapshot ?? "Недоступный товар",
          slug: product?.slug ?? "",
          imageUrl: product?.imageUrl ?? item.productImageUrlSnapshot ?? null,
          ...(view?.partnerPrice
            ? {
                currentPartnerPrice: view.partnerPrice.formattedAmount,
                currentPartnerPriceAmount: view.partnerPrice.amount,
                currentPartnerCurrencyCode: view.partnerPrice.currencyCode,
              }
            : {}),
          currentRetailPrice: view?.retailPrice?.formattedAmount ?? null,
          currentRetailPriceAmount: view?.retailPrice?.amount ?? null,
          currentRetailCurrencyCode: view?.retailPrice?.currencyCode ?? null,
          availableStock: view?.stock?.exactAvailableQuantity ?? null,
          expectedArrivalDate: view?.stock?.expectedArrival?.expectedDate ?? null,
          expectedArrivalQuantity: view?.stock?.expectedArrival?.expectedQuantity ?? null,
          state,
          stateLabel: commercialProductStateLabels[state],
          canConvert: Boolean(product && !(["inactive", "missing_price", "requires_review"] as const).includes(state as never)),
        };
      }),
    };
  }

  async createManual(userId: string, input: { name: string; description?: string | null; visibility: PurchasingListVisibility }): Promise<PurchasingList> {
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    return this.repository.create({ companyId, ...normalizeMetadata(input), sourceType: "manual", sourceReferenceId: null, items: [] });
  }

  async createFromCart(userId: string, input: { name: string; description?: string | null; visibility: PurchasingListVisibility }) {
    if (!this.cartService) throw new InvalidStateError("Cart list creation is unavailable.");
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    const source = await this.cartService.getEstimateSource(userId);
    if (source.companyId !== companyId) throw new NotFoundError("Cart was not found.");
    const list = await this.repository.create({ companyId, ...normalizeMetadata(input), sourceType: "cart", sourceReferenceId: source.cartId, items: source.lines.map((line) => ({ productId: line.productId, quantity: normalizeQuantity(line.quantity), sourceUnitPrice: line.partnerPrice, sourceCurrencyCode: line.currencyCode })) });
    return { list, skipped: 0 };
  }

  async createFromOrder(userId: string, input: { orderId: string; name: string; description?: string | null; visibility: PurchasingListVisibility; selections?: Array<{ lineId: string; quantity: number }> }) {
    if (!this.orderHistoryRepository) throw new InvalidStateError("Order list creation is unavailable.");
    const companyId = await this.resolveCompany(userId, MANAGE_PERMISSION);
    await this.permissionService.ensurePermission(userId, companyId, "orders.view");
    const source = await this.orderHistoryRepository.getReorderSource(requireUuid(input.orderId));
    if (!source || source.companyId !== companyId) throw new NotFoundError("Order was not found.");
    const selection = input.selections ? new Map(input.selections.map((item) => [requireUuid(item.lineId), normalizeQuantity(item.quantity)])) : null;
    if (selection && !selection.size) throw new InvalidStateError("Select at least one product line.");
    const chosen = source.lines.filter((line) => !selection || selection.has(line.lineId));
    const valid = chosen.filter((line) => line.productId);
    if (!valid.length) throw new InvalidStateError("No catalog products can be saved from this order.");
    const grouped = new Map<string, { productId: string; quantity: number; sourceReferenceId: string; sourceUnitPrice: number; sourceCurrencyCode: string | null }>();
    for (const line of valid) {
      const quantity = selection?.get(line.lineId) ?? normalizeQuantity(line.historicalQuantity);
      const previous = grouped.get(line.productId!);
      grouped.set(line.productId!, { productId: line.productId!, quantity: Math.min(9999, (previous?.quantity ?? 0) + quantity), sourceReferenceId: previous?.sourceReferenceId ?? line.lineId, sourceUnitPrice: line.historicalUnitPrice, sourceCurrencyCode: line.historicalCurrencyCode });
    }
    const list = await this.repository.create({ companyId, ...normalizeMetadata(input), sourceType: selection ? "quick_reorder" : "order", sourceReferenceId: source.orderId, items: [...grouped.values()] });
    return { list, skipped: chosen.length - valid.length };
  }

  async addProduct(userId: string, input: { listId: string; productId: string; quantity: number; mergeMode: "increase" | "replace" | "keep" }) {
    await this.resolveCompany(userId, MANAGE_PERMISSION);
    const detail = await this.getDetail(userId, input.listId);
    if (!detail.canManage) throw new InvalidStateError("Purchasing list cannot be changed.");
    const productId = requireUuid(input.productId);
    if (!(await this.catalogService.getProductsByIds(userId, [productId])).length) throw new NotFoundError("Product was not found.");
    return listMutation(() => this.repository.mergeItems({ listId: detail.id, expectedRevision: detail.revision, mergeMode: input.mergeMode, sourceType: "catalog", sourceReferenceId: null, items: [{ productId, quantity: normalizeQuantity(input.quantity) }] }));
  }

  async updateMetadata(userId: string, listId: string, expectedRevision: number, input: { name: string; description?: string | null; visibility: PurchasingListVisibility }) {
    const detail = await this.requireManageable(userId, listId, expectedRevision);
    if (detail.isSystemFavorites) throw new InvalidStateError("System favorites metadata cannot be changed.");
    return listMutation(() => this.repository.updateMetadata({ listId, expectedRevision, ...normalizeMetadata(input) }));
  }

  async updateItems(userId: string, listId: string, expectedRevision: number, items: Array<{ itemId: string; quantity: number; position: number; note?: string | null }>) {
    const detail = await this.requireManageable(userId, listId, expectedRevision);
    if (!items.length || items.length > MAX_ITEMS) throw new InvalidStateError("List item update is invalid.");
    const known = new Set(detail.lines.map((line) => line.id));
    const normalized = items.map((item) => ({ itemId: requireUuid(item.itemId), quantity: normalizeQuantity(item.quantity), position: normalizePosition(item.position), note: normalizeOptional(item.note, 500) }));
    if (new Set(normalized.map((item) => item.itemId)).size !== normalized.length || normalized.some((item) => !known.has(item.itemId))) throw new NotFoundError("List item was not found.");
    return listMutation(() => this.repository.updateItems({ listId: detail.id, expectedRevision, items: normalized }));
  }

  async removeItems(userId: string, listId: string, expectedRevision: number, itemIds: string[]) {
    const detail = await this.requireManageable(userId, listId, expectedRevision);
    const normalized = [...new Set(itemIds.map(requireUuid))];
    if (!normalized.length || normalized.some((id) => !detail.lines.some((line) => line.id === id))) throw new NotFoundError("List item was not found.");
    return listMutation(() => this.repository.removeItems({ listId: detail.id, expectedRevision, itemIds: normalized }));
  }

  async setArchived(userId: string, listId: string, expectedRevision: number, archived: boolean) {
    await this.resolveCompany(userId, MANAGE_PERMISSION);
    const detail = await this.getDetail(userId, listId);
    if (detail.visibility === "private" && detail.createdBy !== userId) throw new InvalidStateError("Purchasing list cannot be changed.");
    if (detail.isSystemFavorites) throw new InvalidStateError("System favorites cannot be archived.");
    if (detail.revision !== expectedRevision) throw new InvalidStateError("Purchasing list changed. Reload it.");
    return listMutation(() => this.repository.setArchived({ listId: detail.id, expectedRevision, archived }));
  }

  async duplicate(userId: string, listId: string, name?: string) {
    await this.resolveCompany(userId, MANAGE_PERMISSION);
    const detail = await this.getDetail(userId, listId);
    return this.repository.duplicate({ listId: detail.id, name: normalizeRequired(name ?? `${detail.name} — копия`, 120) });
  }

  async addToCart(userId: string, input: { listId: string; requestKey: string; itemIds?: string[] }): Promise<PurchasingListConversionResultDto> {
    const detail = await this.getDetail(userId, input.listId);
    if (detail.archivedAt) throw new InvalidStateError("Archived list cannot be added to cart.");
    const selected = input.itemIds?.length ? new Set(input.itemIds.map(requireUuid)) : null;
    const lines = detail.lines.filter((line) => !selected || selected.has(line.id));
    if (!lines.length) throw new InvalidStateError("Select at least one product.");
    const valid = lines.filter((line) => line.canConvert);
    const summary = summarize(lines);
    if (!valid.length) return { repeated: false, destinationId: null, added: 0, ...summary };
    const items = valid.map((line) => ({ itemId: line.id, productId: line.productId, quantity: line.quantity }));
    const mutation = await this.repository.mergeIntoCart({ listId: detail.id, requestKey: requireUuid(input.requestKey), requestFingerprint: fingerprint(detail.id, items), items, summary });
    return { repeated: mutation.repeated, destinationId: mutation.cartId, added: items.length, ...summary };
  }

  async createEstimate(userId: string, input: { listId: string; name: string; requestKey: string; itemIds?: string[] }) {
    if (!this.estimateGateway) throw new InvalidStateError("Estimate creation is unavailable.");
    const detail = await this.getDetail(userId, input.listId);
    if (detail.archivedAt) throw new InvalidStateError("Archived list cannot create an estimate.");
    const selected = input.itemIds?.length ? new Set(input.itemIds.map(requireUuid)) : null;
    const items = detail.lines.filter((line) => (!selected || selected.has(line.id)) && line.canConvert).map((line) => ({ itemId: line.id, productId: line.productId, quantity: line.quantity }));
    if (!items.length) throw new InvalidStateError("No valid products were selected.");
    return this.estimateGateway.createFromPurchasingList(userId, { listId: detail.id, name: normalizeRequired(input.name, 200), requestKey: requireUuid(input.requestKey), items });
  }

  private async requireManageable(userId: string, listId: string, expectedRevision: number) {
    await this.resolveCompany(userId, MANAGE_PERMISSION);
    const detail = await this.getDetail(userId, listId);
    if ((!detail.canManage && !detail.isSystemFavorites) || detail.archivedAt) throw new InvalidStateError("Purchasing list cannot be changed.");
    if (detail.revision !== expectedRevision) throw new InvalidStateError("Purchasing list changed. Reload it.");
    return detail;
  }

  private async loadLiveCommerceKit(userId: string, listId: string, authoritative: boolean): Promise<LiveCommerceKitDetailDto> {
    const companyId = await this.resolveCompany(userId, VIEW_PERMISSION);
    await this.permissionService.ensurePermission(userId, companyId, "catalog.view");
    const record = await measureLiveCommerceKitStage("detail_source", () => this.repository.findById(requireUuid(listId)));
    if (!record || record.companyId !== companyId || record.archivedAt || record.isSystemFavorites) {
      throw new NotFoundError("Purchasing list was not found.");
    }
    const productIds = [...new Set(record.items.map((item) => item.productId))];
    const [products, commercial, canManage] = await Promise.all([
      measureLiveCommerceKitStage("detail_catalog", () => this.catalogService.getProductsByIds(userId, productIds)),
      measureLiveCommerceKitStage("detail_commercial", () => authoritative && this.pricingInventoryService.getAuthoritativeProductCommercialViews
        ? this.pricingInventoryService.getAuthoritativeProductCommercialViews(userId, productIds)
        : this.pricingInventoryService.getProductCommercialViews(userId, productIds)),
      this.permissionService.hasPermission(userId, companyId, MANAGE_PERMISSION),
    ]);
    const productById = new Map(products.map((product) => [product.id, product]));
    const commercialById = new Map(commercial.map((view) => [view.productId, view]));
    const lines = record.items.map((item) => toLiveCommerceKitLine(item, productById.get(item.productId), commercialById.get(item.productId)))
      .sort((left, right) => Number(left.status === "READY") - Number(right.status === "READY") || left.position - right.position);
    const readyCount = lines.filter((line) => line.status === "READY").length;
    return {
      id: record.id,
      name: record.name,
      itemCount: record.items.length,
      totalQuantity: record.items.reduce((sum, item) => sum + item.quantity, 0),
      updatedAt: record.updatedAt,
      revision: record.revision,
      canManage: canManage && (record.visibility === "company" || record.createdBy === userId),
      lines,
      readyCount,
      attentionCount: lines.length - readyCount,
    };
  }

  private async resolveCompany(userId: string, permission: string) {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find((item) => item.status === MembershipStatus.Active);
    const context = await this.companyAccessService.getActiveCompanyContext(userId, membership?.companyId ?? "");
    await this.permissionService.ensurePermission(userId, context.company.id, permission);
    return context.company.id;
  }
}

async function listMutation<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof PurchasingListRepositoryError && error.code === "PT409") {
      throw new DomainConflictError("PURCHASING_LIST_CONFLICT", "Список изменился. Обновите страницу и повторите действие.");
    }
    throw error;
  }
}

function summarize(lines: PurchasingListDetailDto["lines"]) { return { skipped: lines.filter((line) => line.state === "requires_review").length, missingPrice: lines.filter((line) => line.state === "missing_price").length, inactive: lines.filter((line) => line.state === "inactive").length, unavailable: lines.filter((line) => line.state === "temporarily_unavailable").length }; }
function fingerprint(listId: string, items: Array<{ itemId: string; quantity: number }>) { return createHash("sha256").update(`${listId}|${items.slice().sort((a, b) => a.itemId.localeCompare(b.itemId)).map((item) => `${item.itemId}:${item.quantity}`).join("|")}`).digest("hex"); }
function withoutProductIds<T extends { productIds: unknown }>(record: T): Omit<T, "productIds"> { const { productIds, ...rest } = record; void productIds; return rest; }
function withoutItems<T extends { items: unknown }>(record: T): Omit<T, "items"> { const { items, ...rest } = record; void items; return rest; }
function normalizeMetadata(input: { name: string; description?: string | null; visibility: PurchasingListVisibility }) { if (!(["private", "company"] as const).includes(input.visibility)) throw new InvalidStateError("Choose list visibility."); return { name: normalizeRequired(input.name, 120), description: normalizeOptional(input.description, 1000), visibility: input.visibility }; }
function normalizeRequired(value: string, max: number) { const normalized = value.trim().replace(/\s+/g, " "); if (!normalized || normalized.length > max) throw new InvalidStateError("Check the list name."); return normalized; }
function normalizeOptional(value: string | null | undefined, max: number) { const normalized = value?.trim().replace(/\s+/g, " ") ?? ""; if (normalized.length > max) throw new InvalidStateError("Text is too long."); return normalized || null; }
function normalizeQuantity(value: number) { if (!Number.isInteger(value) || value < 1 || value > 9999) throw new InvalidStateError("Quantity must be between 1 and 9999."); return value; }
function normalizePosition(value: number) { if (!Number.isInteger(value) || value < 1 || value > MAX_ITEMS) throw new InvalidStateError("Position is invalid."); return value; }
function normalizePage(value?: number) { return Number.isInteger(value) && value! > 0 ? value! : 1; }
function normalizeFilter(value?: string): "all" | "private" | "company" | "mine" | "archived" { return (["private", "company", "mine", "archived"] as const).includes(value as never) ? value as never : "all"; }
function requireUuid(value: string) { const normalized = value.trim().toLowerCase(); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) throw new InvalidStateError("Identifier is invalid."); return normalized; }

function normalizeLiveCommerceProducts(items: Array<{ productId: string; quantity: number }>) {
  if (!Array.isArray(items) || !items.length || items.length > LIVE_COMMERCE_SELECTION_LIMIT) {
    throw new InvalidStateError("Select between 1 and 50 products.");
  }
  const normalized = items.map((item) => ({ productId: requireUuid(item.productId), quantity: normalizeQuantity(item.quantity) }));
  if (new Set(normalized.map((item) => item.productId)).size !== normalized.length) {
    throw new InvalidStateError("A product was selected more than once.");
  }
  return normalized;
}

function normalizeKitItems(items: Array<{ itemId: string; quantity: number }>) {
  if (!Array.isArray(items) || !items.length || items.length > LIVE_COMMERCE_SELECTION_LIMIT) {
    throw new InvalidStateError("Select between 1 and 50 kit products.");
  }
  const normalized = items.map((item) => ({ itemId: requireUuid(item.itemId), quantity: normalizeQuantity(item.quantity) }));
  if (new Set(normalized.map((item) => item.itemId)).size !== normalized.length) {
    throw new InvalidStateError("A kit product was selected more than once.");
  }
  return normalized;
}

function toLiveCommerceKitLine(
  item: import("../types").PurchasingListItem,
  product: Awaited<ReturnType<CatalogService["getProductsByIds"]>>[number] | undefined,
  commercial: Awaited<ReturnType<PricingInventoryService["getProductCommercialViews"]>>[number] | undefined,
): LiveCommerceKitLineDto {
  const currentPrice = commercial?.isDemoData ? null : commercial?.partnerPrice ?? null;
  const stockAvailable = (commercial?.stock?.exactAvailableQuantity ?? 0) > 0;
  const status = !product
    ? "PRODUCT_INACTIVE"
    : !currentPrice
      ? "PRICE_UNAVAILABLE"
      : !stockAvailable
        ? "UNAVAILABLE"
        : "READY";
  return {
    itemId: item.id,
    productId: item.productId,
    productName: product?.name ?? item.productNameSnapshot ?? "Unavailable product",
    sku: product?.sku ?? "—",
    imageUrl: product?.imageUrl ?? item.productImageUrlSnapshot ?? null,
    quantity: item.quantity,
    position: item.position,
    status,
    currentPrice: currentPrice?.formattedAmount ?? null,
    currentStock: commercial?.stock?.exactAvailableQuantity ?? null,
    product: status === "READY" && product
      ? toLiveCommerceSelectionProduct({ ...product, commercialView: commercial })
      : null,
  };
}

async function measureLiveCommerceKitStage<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  if (process.env.PERFORMANCE_DIAGNOSTICS_ENABLED !== "true") return operation();
  const startedAt = performance.now();
  try {
    return await operation();
  } finally {
    console.info(JSON.stringify({
      event: "live_commerce_kit_performance",
      stage,
      durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
      deployedCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    }));
  }
}
