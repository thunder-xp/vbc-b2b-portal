import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { InvalidStateError, NotFoundError, OperationNotAvailableError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogService } from "../../catalog/services";
import type { OrderProvider, PartnerProvider } from "../../integration/contracts";
import type { ExternalReferenceDTO, SalesOrderDTO } from "../../integration/dto";
import { IntegrationProviderUnavailableError, IntegrationTimeoutError } from "../../integration/errors";
import type { PricingInventoryService } from "../../pricing-inventory/services";
import type { CartRepository, OrderItemSnapshotInput, PartnerOrderRepository } from "../repositories";
import { PartnerOrderStatus, type PartnerOrder } from "../types";

export type PartnerOrderSummaryDto = {
  id: string;
  status: PartnerOrderStatus;
  external1cNumber: string | null;
  requestedDeliveryDate: string;
  submittedAt: string | null;
  createdAt: string;
};

export type PartnerOrderDetailDto = PartnerOrderSummaryDto & {
  lines: Array<{ productName: string; sku: string; quantity: number; unitPrice: string; lineTotal: string }>;
};

export interface PartnerOrderService {
  submit(userId: string, input: { submissionKey: string; requestedDeliveryDate: string }): Promise<PartnerOrder>;
  listOwnCompanyOrders(userId: string): Promise<PartnerOrderSummaryDto[]>;
  getOrder(userId: string, orderId: string): Promise<PartnerOrderDetailDto>;
}

const ORDERS_PERMISSION = "orders.manage";
const ZERO_CHARACTERISTIC_REF = "00000000-0000-0000-0000-000000000000";
const DEFAULT_UNIT_REF = "a4f770f7-5a4e-435f-a55f-28cb995d36c9";
const DEFAULT_VAT_RATE_REF = "acf7b292-1a78-11e5-8b0f-00155d010501";
const REST_AUTHOR_REF = "272a1ac4-0194-11eb-8975-000c29cf9dd4";
const ORDER_STATE_REF = "acf7b2a1-1a78-11e5-8b0f-00155d010501";
const SALES_STRUCTURAL_UNIT_REF = "6d5affb3-94b3-4377-a8c2-8d07f0450d95";
const RESERVATION_STRUCTURAL_UNIT_REF = "86197770-0aac-431a-aad6-8e7099029bbb";

export class DefaultPartnerOrderService implements PartnerOrderService {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly orderRepository: PartnerOrderRepository,
    private readonly companyAccessService: CompanyAccessService,
    private readonly permissionService: PermissionService,
    private readonly catalogService: CatalogService,
    private readonly pricingInventoryService: PricingInventoryService,
    private readonly partnerProvider: PartnerProvider,
    private readonly orderProvider: OrderProvider,
  ) {}

  async submit(userId: string, input: { submissionKey: string; requestedDeliveryDate: string }): Promise<PartnerOrder> {
    const submissionKey = requireUuid(input.submissionKey, "Submission key");
    const deliveryDate = normalizeDeliveryDate(input.requestedDeliveryDate);
    const existing = await this.orderRepository.findBySubmissionKey(submissionKey);
    if (existing) {
      if (existing.status === PartnerOrderStatus.Submitted) return existing;
      throw new InvalidStateError("This order submission is already being processed.");
    }

    const context = await this.resolveContext(userId);
    const company = context.company;
    if (!isUuid(company.external1cId) || !isUuid(company.external1cContractId) || !isUuid(company.external1cPriceTypeId)) {
      throw new InvalidStateError("The partner company is not fully linked to 1C.");
    }
    const cart = await this.cartRepository.findActive(company.id, userId);
    if (!cart || cart.status !== "active") throw new InvalidStateError("The active cart is not available.");
    const cartItems = await this.cartRepository.listItems(cart.id);
    if (!cartItems.length) throw new InvalidStateError("The cart is empty.");

    const productIds = cartItems.map((item) => item.productId);
    const [identities, commercialViews, contracts, priceType] = await Promise.all([
      this.catalogService.getProductOrderIdentities(userId, productIds),
      this.pricingInventoryService.getProductCommercialViews(userId, productIds),
      this.partnerProvider.fetchPartnerContracts({ partnerReference: company.external1cId }),
      this.partnerProvider.fetchPriceType({ reference: company.external1cPriceTypeId }),
    ]);
    const contract = contracts.items.find((item) => item.active && item.reference.externalId.toLowerCase() === company.external1cContractId?.toLowerCase());
    if (!contract?.organizationReference) throw new InvalidStateError("The active 1C customer contract is unavailable.");
    if (!priceType?.active || !priceType.currency) throw new InvalidStateError("The active 1C price type or currency is unavailable.");

    const identitiesById = new Map(identities.map((item) => [item.id, item]));
    const viewsById = new Map(commercialViews.map((item) => [item.productId, item]));
    const snapshots: OrderItemSnapshotInput[] = cartItems.map((item) => {
      const identity = identitiesById.get(item.productId);
      const view = viewsById.get(item.productId);
      const price = view?.partnerPrice;
      if (!identity || !isUuid(identity.external1cId)) throw new InvalidStateError("A cart product is not linked to 1C.");
      if (!price || !price.currencyCode || !Number.isFinite(price.amount) || price.amount <= 0) throw new InvalidStateError("A current partner price is unavailable.");
      const lineTotal = roundMoney(price.amount * item.quantity);
      return {
        productId: item.productId, externalProductRef: identity.external1cId,
        externalCharacteristicRef: ZERO_CHARACTERISTIC_REF, externalUnitRef: DEFAULT_UNIT_REF,
        externalVatRateRef: DEFAULT_VAT_RATE_REF, productName: identity.name, sku: identity.sku,
        quantity: item.quantity, partnerUnitPrice: price.amount, currencyCode: price.currencyCode,
        lineTotal, availableStock: view.stock?.exactAvailableQuantity ?? null,
        nearestArrivalDate: view.stock?.expectedArrival?.expectedDate ?? null,
        nearestArrivalQuantity: view.stock?.expectedArrival?.expectedQuantity ?? null,
      };
    });
    const currencyCodes = [...new Set(snapshots.map((item) => item.currencyCode))];
    if (currencyCodes.length !== 1) throw new InvalidStateError("Cart prices use incompatible currencies.");

    const salesOrder = buildSalesOrder({
      submissionKey, deliveryDate, companyRef: company.external1cId,
      contractRef: company.external1cContractId, priceTypeRef: company.external1cPriceTypeId,
      organizationReference: contract.organizationReference, currencyRef: priceType.currency,
      currencyCode: currencyCodes[0]!, snapshots,
    });
    const attemptId = crypto.randomUUID();
    const order = await this.orderRepository.beginSubmission({
      cartId: cart.id, submissionKey, submissionAttemptId: attemptId,
      requestedDeliveryDate: deliveryDate, payloadSnapshot: toJsonRecord(salesOrder), items: snapshots,
    });
    if (order.submissionAttemptId !== attemptId) {
      if (order.status === PartnerOrderStatus.Submitted) return order;
      throw new InvalidStateError("This order submission is already being processed.");
    }

    let exported;
    try {
      exported = await this.orderProvider.exportSalesOrder(salesOrder);
    } catch (error) {
      const ambiguous = error instanceof IntegrationTimeoutError || error instanceof IntegrationProviderUnavailableError;
      await this.orderRepository.failSubmission({
        orderId: order.id,
        status: ambiguous ? PartnerOrderStatus.Unknown : PartnerOrderStatus.Failed,
        errorCode: ambiguous ? "ONE_C_RESULT_UNKNOWN" : "ONE_C_REJECTED",
        errorMessage: ambiguous ? "1C order result requires reconciliation." : "1C rejected the customer order.",
      });
      throw new OperationNotAvailableError("The order could not be confirmed in 1C.");
    }

    try {
      return await this.orderRepository.completeSubmission({
        orderId: order.id, external1cRef: exported.orderReference.externalId,
        external1cNumber: exported.orderNumber, external1cDate: exported.documentDate,
      });
    } catch {
      throw new OperationNotAvailableError("The 1C order was created and requires portal reconciliation.");
    }
  }

  async listOwnCompanyOrders(userId: string): Promise<PartnerOrderSummaryDto[]> {
    const context = await this.resolveContext(userId);
    return (await this.orderRepository.listByCompanyId(context.company.id)).map(toSummary);
  }

  async getOrder(userId: string, orderId: string): Promise<PartnerOrderDetailDto> {
    const context = await this.resolveContext(userId);
    const order = await this.orderRepository.findById(orderId.trim());
    if (!order || order.companyId !== context.company.id) throw new NotFoundError("Order was not found.");
    const items = await this.orderRepository.listItems(order.id);
    return { ...toSummary(order), lines: items.map((item) => ({
      productName: item.productName, sku: item.sku, quantity: item.quantity,
      unitPrice: formatMoney(item.partnerUnitPrice, item.currencyCode), lineTotal: formatMoney(item.lineTotal, item.currencyCode),
    })) };
  }

  private async resolveContext(userId: string) {
    const memberships = await this.companyAccessService.getOwnMemberships(userId);
    const membership = memberships.find((item) => item.status === MembershipStatus.Active);
    const context = await this.companyAccessService.getActiveCompanyContext(userId, membership?.companyId ?? "");
    await this.permissionService.ensurePermission(userId, context.company.id, ORDERS_PERMISSION);
    return context;
  }
}

function buildSalesOrder(input: {
  submissionKey: string; deliveryDate: string; companyRef: string; contractRef: string; priceTypeRef: string;
  organizationReference: ExternalReferenceDTO; currencyRef: string; currencyCode: string; snapshots: OrderItemSnapshotInput[];
}): SalesOrderDTO {
  return {
    reference: null,
    partnerCompanyReference: ref(input.companyRef, "counterparty"),
    contractReference: ref(input.contractRef, "customer-contract"),
    authorReference: ref(REST_AUTHOR_REF, "user"),
    organizationReference: input.organizationReference,
    priceTypeReference: ref(input.priceTypeRef, "price-type"),
    currencyReference: ref(input.currencyRef, "currency"),
    orderStateReference: ref(ORDER_STATE_REF, "order-state"),
    salesStructuralUnitReference: ref(SALES_STRUCTURAL_UNIT_REF, "structural-unit"),
    reservationStructuralUnitReference: ref(RESERVATION_STRUCTURAL_UNIT_REF, "structural-unit"),
    portalOrderReference: input.submissionKey,
    status: "draft",
    currency: input.currencyCode,
    requestedDeliveryDate: input.deliveryDate,
    documentTotal: roundMoney(input.snapshots.reduce((sum, item) => sum + item.lineTotal, 0)),
    items: input.snapshots.map((item) => ({
      productReference: ref(item.externalProductRef, "catalog-product"), sku: item.sku, name: item.productName,
      quantity: item.quantity, unitCode: null, price: { amount: item.partnerUnitPrice, currency: item.currencyCode },
      characteristicReference: ref(item.externalCharacteristicRef, "product-characteristic"),
      unitReference: ref(item.externalUnitRef, "unit"), vatRateReference: ref(item.externalVatRateRef, "vat-rate"), lineTotal: item.lineTotal,
    })),
    comment: `Заказ создан через Novotech Partner Platform. Идентификатор: ${input.submissionKey}`,
    metadata: null,
  };
}

function ref(externalId: string, externalType: string): ExternalReferenceDTO { return { providerCode: "one-c", externalId, externalType }; }
function requireUuid(value: string, label: string): string { if (!isUuid(value)) throw new InvalidStateError(`${label} is invalid.`); return value.toLowerCase(); }
function isUuid(value: string | null | undefined): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function normalizeDeliveryDate(value: string): string { const normalized = value.trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Date.parse(`${normalized}T23:59:59Z`) < Date.now()) throw new InvalidStateError("Requested delivery date is invalid."); return normalized; }
function roundMoney(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
function toJsonRecord(value: SalesOrderDTO): Record<string, unknown> { return JSON.parse(JSON.stringify(value)) as Record<string, unknown>; }
function toSummary(order: PartnerOrder): PartnerOrderSummaryDto { return { id: order.id, status: order.status, external1cNumber: order.external1cNumber, requestedDeliveryDate: order.requestedDeliveryDate, submittedAt: order.submittedAt, createdAt: order.createdAt }; }
function formatMoney(amount: number, currency: string): string { return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(amount); }
