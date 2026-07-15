import type { CompanyAccessService, PermissionService } from "../../access-control/services";
import { NotFoundError } from "../../access-control/services";
import { MembershipStatus } from "../../access-control/types";
import type { CatalogService } from "../../catalog/services";
import type { OrderProvider, PartnerProvider } from "../../integration/contracts";
import type { ExternalReferenceDTO, SalesOrderDTO } from "../../integration/dto";
import { IntegrationProviderUnavailableError, IntegrationTimeoutError } from "../../integration/errors";
import { isStale } from "../../integration/freshness";
import type { PricingInventoryService } from "../../pricing-inventory/services";
import { OrderRepositoryError, type CartRepository, type OrderItemSnapshotInput, type PartnerOrderRepository } from "../repositories/order.repository";
import { CartStatus, PartnerOrderIntegrationStatus, PartnerOrderStatus, type PartnerOrder, type PartnerOrderItem } from "../types";
import { OrderReconciliationRequiredError, OrderSubmissionInProgressError, RecoverableOrderSubmissionError } from "./order-submission.errors";

export type PartnerOrderSummaryDto = {
  id: string;
  status: PartnerOrderStatus;
  external1cNumber: string | null;
  requestedDeliveryDate: string;
  submittedAt: string | null;
  createdAt: string;
  confirmedAt: string | null;
  integrationStatus: PartnerOrderIntegrationStatus;
  oneCOrderStatus: string | null;
  documentTotal: string | null;
  currencyCode: string | null;
  positionCount: number;
  totalUnitCount: number;
};

export type PartnerOrderDetailDto = PartnerOrderSummaryDto & {
  companyName: string;
  contractNumber: string | null;
  lastSynchronizedAt: string;
  lines: Array<{ productName: string; sku: string; quantity: number; unitPrice: string; lineTotal: string }>;
};

export interface PartnerOrderService {
  submit(userId: string, input: { submissionKey: string; requestedDeliveryDate: string }): Promise<PartnerOrder>;
  listOwnCompanyOrders(userId: string): Promise<PartnerOrderSummaryDto[]>;
  getOrder(userId: string, orderId: string): Promise<PartnerOrderDetailDto>;
  reconcileInternal(orderId: string): Promise<PartnerOrder>;
}

export type PartnerOrderServiceOptions = {
  useLegacyMinimalOrderPayload?: boolean;
};

const ORDERS_PERMISSION = "orders.manage";
const ZERO_CHARACTERISTIC_REF = "00000000-0000-0000-0000-000000000000";
const DEFAULT_UNIT_REF = "a4f770f7-5a4e-435f-a55f-28cb995d36c9";
const DEFAULT_VAT_RATE_REF = "acf7b292-1a78-11e5-8b0f-00155d010501";
const REST_AUTHOR_REF = "272a1ac4-0194-11eb-8975-000c29cf9dd4";
const NOVOTECH_ORGANIZATION_REF = "4643d461-aa49-4b70-9486-a59f80ee6af8";
const ORDER_STATE_REF = "acf7b2a1-1a78-11e5-8b0f-00155d010501";
const SALES_STRUCTURAL_UNIT_REF = "6d5affb3-94b3-4377-a8c2-8d07f0450d95";
const RESERVATION_STRUCTURAL_UNIT_REF = "86197770-0aac-431a-aad6-8e7099029bbb";
const PRODUCT_REFERENCE_BRANCH = "DefaultPartnerOrderService.submit:current_catalog_product_reference";

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
    private readonly options: PartnerOrderServiceOptions = {},
  ) {}

  async submit(userId: string, input: { submissionKey: string; requestedDeliveryDate: string }): Promise<PartnerOrder> {
    const preflightStartedAt = Date.now();
    const submissionKey = requireUuid(input.submissionKey, "Submission key");
    const deliveryDate = normalizeDeliveryDate(input.requestedDeliveryDate);
    console.info(submissionEvent("partner_order_submission_started", "submission_started", {
      submissionKey, orderId: null, cartId: null, companyId: null,
    }));
    const existing = await this.orderRepository.findBySubmissionKey(submissionKey);
    if (existing) {
      if (existing.status === PartnerOrderStatus.Submitted) return existing;
      logRejectedTransition(existing.cartId, null, submissionKey, existing, "existing_submission_attempt");
      if (existing.status === PartnerOrderStatus.Unknown || existing.external1cRef || existing.external1cNumber) {
        throw new OrderReconciliationRequiredError();
      }
      if (existing.status === PartnerOrderStatus.Processing) throw new OrderSubmissionInProgressError();
      throw new RecoverableOrderSubmissionError();
    }

    const context = await diagnosticStep(
      "active_company_resolution",
      () => this.resolveContext(userId),
      { submissionKey },
    );
    const company = context.company;
    console.info({
      event: "partner_order_submission_diagnostic",
      stage: "active_company_resolution",
      submissionKey,
      companyId: company.id,
      companyName: company.displayName,
    });
    if (!isOneCGuid(company.external1cId) || !isOneCGuid(company.external1cPriceTypeId)) {
      failOrderSubmission(
        "counterparty_mapping",
        new RecoverableOrderSubmissionError("The partner company is not fully linked to 1C."),
        {
          submissionKey,
          companyId: company.id,
          companyName: company.displayName,
          counterpartyRef: company.external1cId,
          priceTypeRef: company.external1cPriceTypeId,
        },
      );
    }
    const counterpartyRef = company.external1cId;
    const companyPriceTypeRef = company.external1cPriceTypeId;
    const cart = await this.cartRepository.findActive(company.id, userId);
    if (!cart) throw new RecoverableOrderSubmissionError("The active cart is not available.");
    if (cart.status === CartStatus.Submitting) {
      logRejectedTransition(cart.id, cart.status, submissionKey, null, "cart_already_submitting");
      throw new OrderSubmissionInProgressError();
    }
    if (cart.status !== CartStatus.Active) {
      logRejectedTransition(cart.id, cart.status, submissionKey, null, "cart_not_open");
      throw new RecoverableOrderSubmissionError("The active cart is not available.");
    }
    const cartItems = await this.cartRepository.listItems(cart.id);
    if (!cartItems.length) throw new RecoverableOrderSubmissionError("The cart is empty.");
    console.info({
      event: "partner_order_submission_diagnostic",
      stage: "cart_resolution",
      cartId: cart.id,
      cartStatus: cart.status,
      companyId: company.id,
      submissionKey,
      positionCount: cartItems.length,
      totalUnitCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
    });
    console.info(submissionEvent("partner_order_cart_resolved", "cart_resolved", {
      submissionKey, orderId: null, cartId: cart.id, companyId: company.id,
    }));

    const productIds = cartItems.map((item) => item.productId);
    let resolvedInputs;
    try {
      resolvedInputs = await Promise.all([
        diagnosticStep(
          "product_reference_resolution",
          () => this.catalogService.getProductOrderIdentities(userId, productIds),
          { cartId: cart.id, companyId: company.id, submissionKey },
        ),
        diagnosticStep(
          "partner_price_resolution",
          () => this.pricingInventoryService.getProductCommercialViews(userId, productIds),
          { cartId: cart.id, companyId: company.id, submissionKey },
        ),
        diagnosticStep(
          "contract_resolution",
          () => this.partnerProvider.resolveCustomerOrderContract({
            partnerReference: counterpartyRef,
            organizationReference: NOVOTECH_ORGANIZATION_REF,
            effectiveAt: new Date().toISOString(),
          }),
          {
            cartId: cart.id,
            companyId: company.id,
            counterpartyRef,
            organizationRef: NOVOTECH_ORGANIZATION_REF,
            submissionKey,
          },
        ),
        diagnosticStep(
          "price_type_currency_resolution",
          () => this.partnerProvider.fetchPriceType({ reference: companyPriceTypeRef }),
          { cartId: cart.id, companyId: company.id, priceTypeRef: companyPriceTypeRef, submissionKey },
        ),
        this.options.useLegacyMinimalOrderPayload
          ? diagnosticStep(
              "commercial_exchange_rate_resolution",
              () => this.pricingInventoryService.getApprovedUsdMdlRate
                ? this.pricingInventoryService.getApprovedUsdMdlRate(userId)
                : Promise.resolve(null),
              { cartId: cart.id, companyId: company.id, submissionKey },
            )
          : Promise.resolve<number | null>(null),
      ]);
    } catch (error) {
      console.error({
        event: "partner_order_preflight_failed",
        stage: "preflight",
        cartId: cart.id,
        cartStatus: cart.status,
        companyId: company.id,
        submissionKey,
        ...diagnosticError(error),
      });
      throw new RecoverableOrderSubmissionError("Order preflight validation failed.");
    }
    const [identities, commercialViews, contract, priceType, approvedUsdMdlRate] = resolvedInputs;
    const stalePriceProducts = commercialViews.filter((view) => !view.partnerPrice?.lastUpdatedAt || isStale(view.partnerPrice.lastUpdatedAt, "price"));
    if (stalePriceProducts.length) {
      failOrderSubmission("partner_price_freshness", new RecoverableOrderSubmissionError("Current partner prices are too old for order submission."), {
        cartId: cart.id, companyId: company.id, submissionKey, staleProductCount: stalePriceProducts.length,
      });
    }
    const staleStockProducts = commercialViews.filter((view) => !view.stock?.lastUpdatedAt || isStale(view.stock.lastUpdatedAt, "stock"));
    if (staleStockProducts.length) {
      console.warn({ event: "partner_order_preflight_warning", warning: "stale_stock", cartId: cart.id, companyId: company.id, submissionKey, staleProductCount: staleStockProducts.length });
    }
    console.info({ event: "partner_order_preflight_completed", cartId: cart.id, companyId: company.id, submissionKey, durationMs: Date.now() - preflightStartedAt, productCount: cartItems.length, databaseReadMode: "bulk" });
    if (!contract) {
      failOrderSubmission(
        "contract_resolution",
        new RecoverableOrderSubmissionError("The active 1C customer contract is unavailable."),
        {
          cartId: cart.id,
          companyId: company.id,
          counterpartyRef,
          submissionKey,
        },
      );
    }
    if (!contract.organizationReference) {
      failOrderSubmission(
        "organization_resolution",
        new RecoverableOrderSubmissionError("The active 1C customer contract has no organization."),
        { cartId: cart.id, companyId: company.id, contractRef: contract.reference.externalId, submissionKey },
      );
    }
    if (!priceType?.active || !priceType.currency) {
      failOrderSubmission(
        "price_type_currency_resolution",
        new RecoverableOrderSubmissionError("The active 1C price type or currency is unavailable."),
        {
          cartId: cart.id,
          companyId: company.id,
          priceTypeRef: companyPriceTypeRef,
          priceTypeActive: priceType?.active ?? null,
          currencyRef: priceType?.currency ?? null,
          submissionKey,
        },
      );
    }
    console.info({
      event: "partner_order_submission_diagnostic",
      stage: "commercial_mapping_resolved",
      cartId: cart.id,
      companyId: company.id,
      companyName: company.displayName,
      counterpartyRef,
      contractRef: contract.reference.externalId,
      organizationRef: contract.organizationReference.externalId,
      priceTypeRef: companyPriceTypeRef,
      currencyRef: priceType.currency,
      submissionKey,
    });

    const identitiesById = new Map(identities.map((item) => [item.id, item]));
    const viewsById = new Map(commercialViews.map((item) => [item.productId, item]));
    const snapshots: OrderItemSnapshotInput[] = cartItems.map((item) => {
      const identity = identitiesById.get(item.productId);
      const view = viewsById.get(item.productId);
      const price = view?.partnerPrice;
      const rawExternal1cId = identity?.external1cId;
      const trimmedExternal1cId = typeof rawExternal1cId === "string" ? rawExternal1cId.trim() : null;
      const productReferenceIsValid = isOneCGuid(rawExternal1cId);
      console.info({
        event: "partner_order_product_reference_resolution",
        productId: item.productId,
        sku: identity?.sku ?? null,
        rawExternal1cId: rawExternal1cId ?? null,
        rawExternal1cIdType: typeof rawExternal1cId,
        trimmedExternal1cId,
        validatorFunctionName: "isOneCGuid",
        validatorResult: productReferenceIsValid,
        zeroGuidResult: isZeroGuid(rawExternal1cId),
        sourceFile: "src/modules/orders/services/order.service.ts",
        logicalBranchIdentifier: PRODUCT_REFERENCE_BRANCH,
        deployedCommitSha: deployedCommitSha(),
        databaseReferenceFieldName: "catalog_products.external_1c_id",
        resolvedProductRef: productReferenceIsValid ? trimmedExternal1cId : null,
        referenceSource: "current_catalog",
      });
      if (!identity || !productReferenceIsValid || !trimmedExternal1cId) {
        failOrderSubmission(
          "product_reference_resolution",
          new RecoverableOrderSubmissionError("A cart product is not linked to 1C."),
          { cartId: cart.id, companyId: company.id, productId: item.productId, sku: identity?.sku ?? null, submissionKey },
        );
      }
      if (!price || !price.currencyCode || !Number.isFinite(price.amount) || price.amount <= 0) {
        failOrderSubmission(
          "partner_price_resolution",
          new RecoverableOrderSubmissionError("A current partner price is unavailable."),
          { cartId: cart.id, companyId: company.id, productId: item.productId, sku: identity.sku, product1cRef: identity.external1cId, submissionKey },
        );
      }
      const lineTotal = roundMoney(price.amount * item.quantity);
      return {
        productId: item.productId, externalProductRef: trimmedExternal1cId,
        externalCharacteristicRef: ZERO_CHARACTERISTIC_REF, externalUnitRef: DEFAULT_UNIT_REF,
        externalVatRateRef: DEFAULT_VAT_RATE_REF, productName: identity.name, sku: identity.sku,
        quantity: item.quantity, partnerUnitPrice: price.amount, currencyCode: price.currencyCode,
        lineTotal, availableStock: view.stock?.exactAvailableQuantity ?? null,
        nearestArrivalDate: view.stock?.expectedArrival?.expectedDate ?? null,
        nearestArrivalQuantity: view.stock?.expectedArrival?.expectedQuantity ?? null,
      };
    });
    console.info({
      event: "partner_order_submission_diagnostic",
      stage: "product_reference_resolution_completed",
      cartId: cart.id,
      submissionKey,
      resolvedProductCount: snapshots.length,
      deployedCommitSha: deployedCommitSha(),
    });
    const currencyCodes = [...new Set(snapshots.map((item) => item.currencyCode))];
    if (currencyCodes.length !== 1) throw new RecoverableOrderSubmissionError("Cart prices use incompatible currencies.");
    const exportSnapshots = this.options.useLegacyMinimalOrderPayload
      ? convertOrderSnapshotsToMdl(snapshots, approvedUsdMdlRate)
      : snapshots;
    const exportCurrencyCode = this.options.useLegacyMinimalOrderPayload
      ? "MDL"
      : currencyCodes[0]!;
    console.info({
      event: "partner_order_submission_diagnostic",
      stage: "order_lines_resolved",
      cartId: cart.id,
      companyId: company.id,
      submissionKey,
      items: snapshots.map((item) => ({
        sku: item.sku,
        product1cRef: item.externalProductRef,
        quantity: item.quantity,
        partnerUnitPrice: item.partnerUnitPrice,
        lineTotal: item.lineTotal,
        currencyCode: item.currencyCode,
      })),
    });

    const salesOrder = buildSalesOrder({
      submissionKey, deliveryDate, companyRef: counterpartyRef,
      contractRef: contract.reference.externalId, priceTypeRef: companyPriceTypeRef,
      organizationReference: contract.organizationReference, currencyRef: priceType.currency,
      currencyCode: exportCurrencyCode, snapshots: exportSnapshots,
    });
    console.info(submissionEvent("partner_order_payload_built", "payload_built", {
      submissionKey, orderId: null, cartId: cart.id, companyId: company.id,
    }));
    if (this.options.useLegacyMinimalOrderPayload) {
      assertLegacyExportIntegrity(cartItems.length, salesOrder);
    }
    const attemptId = crypto.randomUUID();
    let order;
    try {
      console.info({
        event: "partner_order_submission_diagnostic",
        stage: "idempotency_acquisition",
        cartId: cart.id,
        companyId: company.id,
        submissionKey,
        submissionAttemptId: attemptId,
      });
      order = await this.orderRepository.beginSubmission({
        cartId: cart.id, submissionKey, submissionAttemptId: attemptId,
        requestedDeliveryDate: deliveryDate, payloadSnapshot: toJsonRecord(salesOrder), items: snapshots,
      });
    } catch (error) {
      console.error({ event: "partner_order_transition_rejected", cartId: cart.id, cartStatus: cart.status, submissionKey, transition: "active_to_submitting", repositoryErrorCode: error instanceof OrderRepositoryError ? error.code : null, repositoryErrorMessage: error instanceof OrderRepositoryError ? error.databaseMessage : null });
      throw new RecoverableOrderSubmissionError("Order submission state transition failed.");
    }
    console.info({
      event: "partner_order_submission_diagnostic",
      stage: "idempotency_acquired",
      cartId: cart.id,
      companyId: company.id,
      submissionKey,
      submissionAttemptId: attemptId,
      orderId: order.id,
      orderStatus: order.status,
    });
    if (order.submissionAttemptId !== attemptId) {
      if (order.status === PartnerOrderStatus.Submitted) return order;
      logRejectedTransition(cart.id, cart.status, submissionKey, order, "submission_attempt_not_owned");
      if (order.status === PartnerOrderStatus.Unknown || order.external1cRef || order.external1cNumber) throw new OrderReconciliationRequiredError();
      if (order.status === PartnerOrderStatus.Processing) throw new OrderSubmissionInProgressError();
      throw new RecoverableOrderSubmissionError();
    }

    let exported;
    try {
      console.info(submissionEvent("partner_order_one_c_post_started", "one_c_post_started", {
        submissionKey, orderId: order.id, cartId: cart.id, companyId: company.id,
      }));
      exported = await this.orderProvider.exportSalesOrder(salesOrder);
      console.info(submissionEvent("partner_order_read_back_verified", "read_back_verified", {
        submissionKey, orderId: order.id, cartId: cart.id, companyId: company.id,
      }));
    } catch (error) {
      console.error({
        event: "partner_order_submission_failed",
        stage: "one_c_order_export",
        cartId: cart.id,
        companyId: company.id,
        submissionKey,
        orderId: order.id,
        ...diagnosticError(error),
      });
      const ambiguous = error instanceof IntegrationTimeoutError || error instanceof IntegrationProviderUnavailableError;
      await this.orderRepository.failSubmission({
        orderId: order.id,
        status: ambiguous ? PartnerOrderStatus.Unknown : PartnerOrderStatus.Failed,
        errorCode: ambiguous ? "ONE_C_RESULT_UNKNOWN" : "ONE_C_REJECTED",
        errorMessage: ambiguous ? "1C order result requires reconciliation." : "1C rejected the customer order.",
      });
      if (ambiguous) throw new OrderReconciliationRequiredError();
      throw new RecoverableOrderSubmissionError("1C rejected the customer order.");
    }

    try {
      const completedOrder = await this.orderRepository.completeSubmission({
        orderId: order.id, external1cRef: exported.orderReference.externalId,
        external1cNumber: exported.orderNumber, external1cDate: exported.documentDate,
        oneCOrderStatus: exported.status,
        documentTotal: snapshots.reduce((total, item) => total + item.lineTotal, 0),
        currencyCode: currencyCodes[0]!,
        contractNumber: contract.number ?? contract.code ?? null,
      });
      console.info({
        event: "partner_order_submission_diagnostic",
        stage: "portal_persistence_completed",
        cartId: cart.id,
        companyId: company.id,
        submissionKey,
        orderId: completedOrder.id,
        orderStatus: completedOrder.status,
        external1cRef: completedOrder.external1cRef,
        external1cNumber: completedOrder.external1cNumber,
      });
      console.info(submissionEvent("partner_order_cart_cleared", "cart_cleared", {
        submissionKey, orderId: completedOrder.id, cartId: cart.id, companyId: company.id,
      }));
      return completedOrder;
    } catch (error) {
      console.error({
        event: "partner_order_submission_failed",
        stage: "portal_persistence",
        cartId: cart.id,
        companyId: company.id,
        submissionKey,
        orderId: order.id,
        external1cRef: exported.orderReference.externalId,
        external1cNumber: exported.orderNumber,
        ...diagnosticError(error),
      });
      throw new OrderReconciliationRequiredError();
    }
  }

  async listOwnCompanyOrders(userId: string): Promise<PartnerOrderSummaryDto[]> {
    const context = await this.resolveContext(userId);
    const orders = await this.orderRepository.listByCompanyId(context.company.id);
    const items = await this.orderRepository.listItemsByOrderIds(orders.map((order) => order.id));
    const itemsByOrder = groupItemsByOrder(items);
    return orders.map((order) => toSummary(order, itemsByOrder.get(order.id) ?? []));
  }

  async getOrder(userId: string, orderId: string): Promise<PartnerOrderDetailDto> {
    const context = await this.resolveContext(userId);
    const order = await this.orderRepository.findById(orderId.trim());
    if (!order || order.companyId !== context.company.id) throw new NotFoundError("Order was not found.");
    const items = await this.orderRepository.listItems(order.id);
    return { ...toSummary(order, items), companyName: context.company.displayName, contractNumber: order.contractNumber,
      lastSynchronizedAt: order.confirmedAt ?? order.lastReconciledAt ?? order.updatedAt, lines: items.map((item) => ({
      productName: item.productName, sku: item.sku, quantity: item.quantity,
      unitPrice: formatMoney(item.partnerUnitPrice, item.currencyCode), lineTotal: formatMoney(item.lineTotal, item.currencyCode),
    })) };
  }

  async reconcileInternal(orderId: string): Promise<PartnerOrder> {
    const order = await this.orderRepository.findById(requireUuid(orderId.trim(), "Order ID"));
    if (!order) throw new NotFoundError("Order was not found.");
    if (order.status === PartnerOrderStatus.Submitted) return order;
    if (order.status !== PartnerOrderStatus.Unknown && order.status !== PartnerOrderStatus.Processing) {
      throw new RecoverableOrderSubmissionError("Order reconciliation is not available.");
    }
    const snapshot = parseSalesOrderSnapshot(order.payloadSnapshot);
    console.info(orderLog("partner_order_reconciliation_started", "reconciliation_started", order));
    const matches = await this.orderProvider.findExportedSalesOrders(snapshot);
    if (matches.length === 0) {
      const reconciled = await this.orderRepository.confirmNotCreated({ orderId: order.id, submissionKey: order.submissionKey });
      console.info(orderLog("partner_order_reconciliation_completed", "confirmed_not_created", reconciled));
      return reconciled;
    }
    if (matches.length > 1) {
      const reconciled = await this.orderRepository.markManualReviewRequired(order.id);
      console.warn(orderLog("partner_order_reconciliation_completed", "manual_review_required", reconciled));
      return reconciled;
    }

    const match = matches[0]!;
    const items = await this.orderRepository.listItems(order.id);
    const completed = await this.orderRepository.completeSubmission({
      orderId: order.id,
      external1cRef: match.orderReference.externalId,
      external1cNumber: match.orderNumber,
      external1cDate: match.documentDate,
      oneCOrderStatus: match.status,
      documentTotal: items.reduce((total, item) => total + item.lineTotal, 0),
      currencyCode: singleCurrency(items),
      contractNumber: order.contractNumber,
    });
    console.info(orderLog("partner_order_reconciliation_completed", "confirmed", completed));
    return completed;
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

function convertOrderSnapshotsToMdl(
  snapshots: OrderItemSnapshotInput[],
  approvedUsdMdlRate: number | null,
): OrderItemSnapshotInput[] {
  return snapshots.map((snapshot) => {
    if (snapshot.currencyCode === "MDL") return snapshot;
    if (snapshot.currencyCode !== "USD") {
      throw new RecoverableOrderSubmissionError(
        "The partner price currency cannot be converted for 1C.",
      );
    }
    if (
      approvedUsdMdlRate === null ||
      !Number.isFinite(approvedUsdMdlRate) ||
      approvedUsdMdlRate <= 0
    ) {
      throw new RecoverableOrderSubmissionError(
        "The approved USD/MDL commercial rate is unavailable.",
      );
    }

    const partnerUnitPrice = Math.round(
      snapshot.partnerUnitPrice * approvedUsdMdlRate,
    );
    return {
      ...snapshot,
      partnerUnitPrice,
      currencyCode: "MDL",
      lineTotal: Math.round(snapshot.lineTotal * approvedUsdMdlRate),
    };
  });
}

export function assertLegacyExportIntegrity(
  expectedLineCount: number,
  order: SalesOrderDTO,
): void {
  const linesAreValid = order.items.length === expectedLineCount &&
    order.items.every((item) =>
      Number.isInteger(item.quantity) && item.quantity > 0 &&
      item.price !== null && Number.isFinite(item.price.amount) && item.price.amount > 0 &&
      Number.isFinite(item.lineTotal) && item.lineTotal > 0,
    );
  const lineTotal = order.items.reduce((total, item) => total + item.lineTotal, 0);
  if (!linesAreValid || lineTotal !== order.documentTotal) {
    throw new RecoverableOrderSubmissionError(
      "The legacy 1C order payload failed total integrity validation.",
    );
  }
}

function ref(externalId: string, externalType: string): ExternalReferenceDTO { return { providerCode: "one-c", externalId, externalType }; }
function requireUuid(value: string, label: string): string { if (!isUuid(value)) throw new RecoverableOrderSubmissionError(`${label} is invalid.`); return value.toLowerCase(); }
function isUuid(value: string | null | undefined): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function isOneCGuid(value: string | null | undefined): value is string {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return !isZeroGuid(normalized) &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(normalized);
}
function isZeroGuid(value: string | null | undefined): boolean { return typeof value === "string" && value.trim().toLowerCase() === ZERO_CHARACTERISTIC_REF; }
function deployedCommitSha(): string { return process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "local"; }
function normalizeDeliveryDate(value: string): string { const normalized = value.trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Date.parse(`${normalized}T23:59:59Z`) < Date.now()) throw new RecoverableOrderSubmissionError("Requested delivery date is invalid."); return normalized; }
function roundMoney(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
function toJsonRecord(value: SalesOrderDTO): Record<string, unknown> { return JSON.parse(JSON.stringify(value)) as Record<string, unknown>; }
function toSummary(order: PartnerOrder, items: PartnerOrderItem[]): PartnerOrderSummaryDto {
  const currencyCode = order.currencyCode ?? (items.length ? singleCurrency(items) : null);
  const total = order.documentTotal ?? items.reduce((sum, item) => sum + item.lineTotal, 0);
  return {
    id: order.id,
    status: order.status,
    external1cNumber: order.external1cNumber,
    requestedDeliveryDate: order.requestedDeliveryDate,
    submittedAt: order.submittedAt,
    createdAt: order.createdAt,
    confirmedAt: order.confirmedAt,
    integrationStatus: order.integrationStatus,
    oneCOrderStatus: order.oneCOrderStatus,
    documentTotal: currencyCode ? formatMoney(total, currencyCode) : null,
    currencyCode,
    positionCount: items.length,
    totalUnitCount: items.reduce((sum, item) => sum + item.quantity, 0),
  };
}
function formatMoney(amount: number, currency: string): string { return new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(amount); }

function groupItemsByOrder(items: PartnerOrderItem[]): Map<string, PartnerOrderItem[]> {
  const result = new Map<string, PartnerOrderItem[]>();
  for (const item of items) result.set(item.orderId, [...(result.get(item.orderId) ?? []), item]);
  return result;
}

function singleCurrency(items: PartnerOrderItem[]): string {
  const currencies = [...new Set(items.map((item) => item.currencyCode))];
  if (currencies.length !== 1) throw new RecoverableOrderSubmissionError("Order snapshot currency is inconsistent.");
  return currencies[0]!;
}

function parseSalesOrderSnapshot(value: Record<string, unknown>): SalesOrderDTO {
  if (!value || typeof value !== "object" || !Array.isArray(value.items) || typeof value.portalOrderReference !== "string") {
    throw new RecoverableOrderSubmissionError("Order snapshot is unavailable for reconciliation.");
  }
  return value as SalesOrderDTO;
}

function orderLog(event: string, stage: string, order: PartnerOrder): Record<string, unknown> {
  return {
    event,
    stage,
    submissionKey: order.submissionKey,
    orderId: order.id,
    cartId: order.cartId,
    companyId: order.companyId,
    deployedCommitSha: deployedCommitSha(),
  };
}

function submissionEvent(
  event: string,
  stage: string,
  identifiers: { submissionKey: string; orderId: string | null; cartId: string | null; companyId: string | null },
): Record<string, unknown> {
  return { event, stage, ...identifiers, deployedCommitSha: deployedCommitSha() };
}

async function diagnosticStep<T>(
  stage: string,
  operation: () => Promise<T>,
  details: Record<string, unknown>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error({
      event: "partner_order_submission_failed",
      stage,
      ...details,
      ...diagnosticError(error),
    });
    throw error;
  }
}

function failOrderSubmission(
  stage: string,
  error: Error,
  details: Record<string, unknown>,
): never {
  console.error({
    event: "partner_order_submission_failed",
    stage,
    ...details,
    ...diagnosticError(error),
  });
  throw error;
}

function diagnosticError(error: unknown): Record<string, unknown> {
  return {
    errorType: error instanceof Error ? error.constructor.name : typeof error,
    errorName: error instanceof Error ? error.name : null,
    errorMessage: error instanceof Error ? error.message : null,
    errorStack: error instanceof Error ? error.stack : null,
  };
}

function logRejectedTransition(
  cartId: string | null,
  cartStatus: string | null,
  submissionKey: string,
  order: PartnerOrder | null,
  transition: string,
): void {
  console.error({
    event: "partner_order_transition_rejected",
    cartId,
    cartStatus,
    submissionKey,
    existingOrderAttemptId: order?.submissionAttemptId ?? null,
    existingOrderStatus: order?.status ?? null,
    transition,
  });
}
