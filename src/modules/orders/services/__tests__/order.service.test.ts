import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IntegrationHttpError } from "../../../integration/errors";
import type { PartnerOrderRepository } from "../../repositories";
import { PartnerOrderStatus, type PartnerOrder } from "../../types";
import { DefaultPartnerOrderService } from "../order.service";
import { OrderReconciliationRequiredError, OrderSubmissionInProgressError, RecoverableOrderSubmissionError } from "../order-submission.errors";

const SUBMISSION_KEY = "55555555-5555-4555-8555-555555555555";

describe("DefaultPartnerOrderService", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("reloads current prices, snapshots them, exports once, and persists the returned 1C identity", async () => {
    const dependencies = makeDependencies();
    const result = await dependencies.service.submit("user-1", input());

    expect(dependencies.pricingService.getProductCommercialViews).toHaveBeenCalledWith("user-1", ["product-1"]);
    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledOnce();
    const beginInput = dependencies.orderRepository.beginSubmission.mock.calls[0][0];
    expect(beginInput.items[0]).toMatchObject({ partnerUnitPrice: 12.5, quantity: 2, lineTotal: 25 });
    expect(dependencies.orderRepository.completeSubmission).toHaveBeenCalledWith({
      orderId: "order-1", external1cRef: "77777777-7777-4777-8777-777777777777",
      external1cNumber: "NSUU-TEST", external1cDate: "2026-07-13T20:17:30.000Z",
    });
    expect(result.status).toBe(PartnerOrderStatus.Submitted);
  });

  it("blocks submission when a product has no valid 1C reference", async () => {
    const dependencies = makeDependencies();
    dependencies.catalogService.getProductOrderIdentities.mockResolvedValue([{ id: "product-1", external1cId: "invalid", sku: "SKU-1", name: "Camera" }]);
    await expect(dependencies.service.submit("user-1", input())).rejects.toBeInstanceOf(RecoverableOrderSubmissionError);
    expect(dependencies.orderRepository.beginSubmission).not.toHaveBeenCalled();
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("accepts the current non-RFC 1C product GUID and logs current-catalog provenance", async () => {
    const dependencies = makeDependencies();
    const productReference = "9a5c59b8-0293-11f1-d58d-7239d3b7bd5c";
    dependencies.catalogService.getProductOrderIdentities.mockResolvedValue([{
      id: "product-1",
      external1cId: productReference,
      sku: "400691",
      name: "DH-IPC-HFW2649TL-S-PRO",
    }]);

    await expect(dependencies.service.submit("user-1", input())).resolves.toMatchObject({
      status: PartnerOrderStatus.Submitted,
    });

    expect(console.info).toHaveBeenCalledWith({
      event: "partner_order_product_reference_resolution",
      productId: "product-1",
      sku: "400691",
      rawExternal1cId: productReference,
      rawExternal1cIdType: "string",
      trimmedExternal1cId: productReference,
      validatorFunctionName: "isOneCGuid",
      validatorResult: true,
      zeroGuidResult: false,
      sourceFile: "src/modules/orders/services/order.service.ts",
      logicalBranchIdentifier: "DefaultPartnerOrderService.submit:current_catalog_product_reference",
      deployedCommitSha: "local",
      databaseReferenceFieldName: "catalog_products.external_1c_id",
      resolvedProductRef: productReference,
      referenceSource: "current_catalog",
    });
    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({
        productReference: expect.objectContaining({ externalId: productReference }),
      })],
    }));
  });

  it("rejects the zero 1C product GUID", async () => {
    const dependencies = makeDependencies();
    dependencies.catalogService.getProductOrderIdentities.mockResolvedValue([{
      id: "product-1",
      external1cId: "00000000-0000-0000-0000-000000000000",
      sku: "400691",
      name: "DH-IPC-HFW2649TL-S-PRO",
    }]);

    await expect(dependencies.service.submit("user-1", input()))
      .rejects.toBeInstanceOf(RecoverableOrderSubmissionError);
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("trims a valid non-RFC 1C product GUID before export", async () => {
    const dependencies = makeDependencies();
    const productReference = "9a5c59b8-0293-11f1-d58d-7239d3b7bd5c";
    dependencies.catalogService.getProductOrderIdentities.mockResolvedValue([{
      id: "product-1",
      external1cId: `  ${productReference}  `,
      sku: "400691",
      name: "DH-IPC-HFW2649TL-S-PRO",
    }]);

    await dependencies.service.submit("user-1", input());

    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({
        productReference: expect.objectContaining({ externalId: productReference }),
      })],
    }));
  });

  it("rejects malformed 1C product GUIDs", async () => {
    const dependencies = makeDependencies();
    dependencies.catalogService.getProductOrderIdentities.mockResolvedValue([{
      id: "product-1",
      external1cId: "9a5c59b8-0293-11f1-d58d-not-hexadecimal",
      sku: "400691",
      name: "DH-IPC-HFW2649TL-S-PRO",
    }]);

    await expect(dependencies.service.submit("user-1", input()))
      .rejects.toBeInstanceOf(RecoverableOrderSubmissionError);
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("keeps strict RFC validation for the portal submission key", async () => {
    const dependencies = makeDependencies();

    await expect(dependencies.service.submit("user-1", {
      ...input(),
      submissionKey: "9a5c59b8-0293-11f1-d58d-7239d3b7bd5c",
    })).rejects.toBeInstanceOf(RecoverableOrderSubmissionError);

    expect(dependencies.catalogService.getProductOrderIdentities).not.toHaveBeenCalled();
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("blocks submission when the selected customer contract cannot be resolved", async () => {
    const dependencies = makeDependencies();
    dependencies.partnerProvider.resolveCustomerOrderContract.mockResolvedValue(null);
    await expect(dependencies.service.submit("user-1", input())).rejects.toBeInstanceOf(RecoverableOrderSubmissionError);
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.objectContaining({
      event: "partner_order_submission_failed",
      stage: "contract_resolution",
    }));
  });

  it("logs the original preflight exception at the exact failing stage", async () => {
    const dependencies = makeDependencies();
    dependencies.partnerProvider.resolveCustomerOrderContract.mockRejectedValue(new Error("Contract lookup failed."));

    await expect(dependencies.service.submit("user-1", input())).rejects.toBeInstanceOf(RecoverableOrderSubmissionError);

    expect(console.error).toHaveBeenCalledWith(expect.objectContaining({
      event: "partner_order_submission_failed",
      stage: "contract_resolution",
      errorType: "Error",
      errorName: "Error",
      errorMessage: "Contract lookup failed.",
    }));
    expect(dependencies.orderRepository.beginSubmission).not.toHaveBeenCalled();
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("preserves the cart and marks a rejected 1C write as failed", async () => {
    const dependencies = makeDependencies();
    dependencies.orderProvider.exportSalesOrder.mockRejectedValue(new IntegrationHttpError());
    await expect(dependencies.service.submit("user-1", input())).rejects.toBeInstanceOf(RecoverableOrderSubmissionError);
    expect(dependencies.orderRepository.failSubmission).toHaveBeenCalledWith(expect.objectContaining({ orderId: "order-1", status: PartnerOrderStatus.Failed }));
    expect(dependencies.orderRepository.completeSubmission).not.toHaveBeenCalled();
  });

  it("returns an already submitted order without a second 1C request", async () => {
    const dependencies = makeDependencies();
    dependencies.orderRepository.findBySubmissionKey.mockResolvedValue(order({ status: PartnerOrderStatus.Submitted }));
    const result = await dependencies.service.submit("user-1", input());
    expect(result.status).toBe(PartnerOrderStatus.Submitted);
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("does not export when another attempt owns the same submission", async () => {
    const dependencies = makeDependencies();
    dependencies.orderRepository.beginSubmission.mockResolvedValue(order({ submissionAttemptId: "88888888-8888-4888-8888-888888888888" }));
    await expect(dependencies.service.submit("user-1", input())).rejects.toBeInstanceOf(OrderSubmissionInProgressError);
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("uses the default 1C customer contract when the company has no stored contract", async () => {
    const dependencies = makeDependencies();
    dependencies.company.external1cContractId = null;
    await dependencies.service.submit("user-1", input());
    expect(dependencies.partnerProvider.resolveCustomerOrderContract).toHaveBeenCalledWith(expect.objectContaining({
      partnerReference: "11111111-1111-4111-8111-111111111111",
      organizationReference: "4643d461-aa49-4b70-9486-a59f80ee6af8",
    }));
    expect(dependencies.partnerProvider.fetchPartnerContracts).not.toHaveBeenCalled();
    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledWith(expect.objectContaining({
      contractReference: expect.objectContaining({ externalId: "22222222-2222-4222-8222-222222222222" }),
    }));
  });

  it("blocks an ambiguous attempt without another provider call", async () => {
    const dependencies = makeDependencies();
    dependencies.orderRepository.findBySubmissionKey.mockResolvedValue(order({ status: PartnerOrderStatus.Unknown }));
    await expect(dependencies.service.submit("user-1", input())).rejects.toBeInstanceOf(OrderReconciliationRequiredError);
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("allows a stale definitive failure to retry the same cart with a new key", async () => {
    const dependencies = makeDependencies();
    dependencies.orderRepository.findBySubmissionKey
      .mockResolvedValueOnce(order({ status: PartnerOrderStatus.Failed }))
      .mockResolvedValueOnce(null);
    await expect(dependencies.service.submit("user-1", input())).rejects.toBeInstanceOf(RecoverableOrderSubmissionError);
    await expect(dependencies.service.submit("user-1", { ...input(), submissionKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })).resolves.toMatchObject({ status: PartnerOrderStatus.Submitted });
    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledOnce();
  });
});

function makeDependencies() {
  const cartRepository = {
    findActive: vi.fn().mockResolvedValue({ id: "cart-1", companyId: "company-1", createdBy: "user-1", status: "active", createdAt: "2026-01-01", updatedAt: "2026-01-01" }),
    listItems: vi.fn().mockResolvedValue([{ id: "item-1", cartId: "cart-1", productId: "product-1", quantity: 2, createdAt: "2026-01-01", updatedAt: "2026-01-01" }]),
  };
  const orderRepository = {
    findBySubmissionKey: vi.fn().mockResolvedValue(null), listByCompanyId: vi.fn(), findById: vi.fn(), listItems: vi.fn(),
    beginSubmission: vi.fn(async (value: Parameters<PartnerOrderRepository["beginSubmission"]>[0]) => order({ submissionAttemptId: value.submissionAttemptId })),
    completeSubmission: vi.fn().mockResolvedValue(order({ status: PartnerOrderStatus.Submitted, external1cRef: "77777777-7777-4777-8777-777777777777", external1cNumber: "NSUU-TEST" })),
    failSubmission: vi.fn().mockResolvedValue(order({ status: PartnerOrderStatus.Failed })),
  };
  const company: { id: string; external1cId: string; external1cContractId: string | null; external1cPriceTypeId: string } = {
    id: "company-1", external1cId: "11111111-1111-4111-8111-111111111111",
    external1cContractId: "22222222-2222-4222-8222-222222222222", external1cPriceTypeId: "33333333-3333-4333-8333-333333333333",
  };
  const companyAccessService = { getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company-1", status: "active" }]), getActiveCompanyContext: vi.fn().mockResolvedValue({ company }) };
  const permissionService = { ensurePermission: vi.fn().mockResolvedValue({ isAllowed: true }) };
  const catalogService = { getProductOrderIdentities: vi.fn().mockResolvedValue([{ id: "product-1", external1cId: "66666666-6666-4666-8666-666666666666", sku: "SKU-1", name: "Camera" }]) };
  const pricingService = { getProductCommercialViews: vi.fn().mockResolvedValue([{ productId: "product-1", partnerPrice: { amount: 12.5, currencyCode: "USD", formattedAmount: "$12.50" }, stock: { exactAvailableQuantity: 5, expectedArrival: null } }]) };
  const partnerProvider = {
    fetchPartnerContracts: vi.fn().mockResolvedValue({ items: [{ reference: ref("22222222-2222-4222-8222-222222222222"), active: true, organizationReference: ref("4643d461-aa49-4b70-9486-a59f80ee6af8") }], nextCursor: null, sourceTimestamp: null }),
    resolveCustomerOrderContract: vi.fn().mockResolvedValue({ reference: ref("22222222-2222-4222-8222-222222222222"), active: true, organizationReference: ref("4643d461-aa49-4b70-9486-a59f80ee6af8") }),
    fetchPriceType: vi.fn().mockResolvedValue({ active: true, currency: "44444444-4444-4444-8444-444444444444" }),
  };
  const orderProvider = { exportSalesOrder: vi.fn().mockResolvedValue({ orderReference: ref("77777777-7777-4777-8777-777777777777"), orderNumber: "NSUU-TEST", documentDate: "2026-07-13T20:17:30.000Z", status: "unposted", exportedAt: "2026-07-13T20:17:31.000Z" }) };
  const service = new DefaultPartnerOrderService(cartRepository as never, orderRepository as never, companyAccessService as never, permissionService as never, catalogService as never, pricingService as never, partnerProvider as never, orderProvider as never);
  return { service, orderRepository, catalogService, pricingService, partnerProvider, orderProvider, company };
}

function input() { return { submissionKey: SUBMISSION_KEY, requestedDeliveryDate: "2099-01-10" }; }
function ref(externalId: string) { return { providerCode: "one-c", externalId, externalType: "test" }; }
function order(overrides: Partial<PartnerOrder> = {}): PartnerOrder {
  return { id: "order-1", companyId: "company-1", submittedBy: "user-1", cartId: "cart-1", submissionKey: SUBMISSION_KEY, submissionAttemptId: "99999999-9999-4999-8999-999999999999", status: PartnerOrderStatus.Processing, requestedDeliveryDate: "2099-01-10", external1cRef: null, external1cNumber: null, external1cDate: null, payloadSnapshot: {}, safeErrorCode: null, safeErrorMessage: null, submittedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01", ...overrides };
}
