import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Decimal from "decimal.js";

import { IntegrationHttpError } from "../../../integration/errors";
import { OrderRepositoryError, type PartnerOrderRepository } from "../../repositories";
import { PartnerOrderIntegrationStatus, PartnerOrderStatus, type PartnerOrder } from "../../types";
import { assertLegacyExportIntegrity, DefaultPartnerOrderService } from "../order.service";
import { OrderReconciliationRequiredError, OrderSubmissionInProgressError, RecoverableOrderSubmissionError } from "../order-submission.errors";
import { EffectiveCommercialPriceChangedError } from "../../../pricing-inventory/types/effective-price";

const SUBMISSION_KEY = "55555555-5555-4555-8555-555555555555";

describe("DefaultPartnerOrderService", () => {
  it("snapshots and exports both same-SKU contexts using the exact line price and evidence", async () => {
    const dependencies = makeDependencies({ useLegacyMinimalOrderPayload: true });
    const row = { id: "standard-line", cartId: "cart-1", productId: "product-1", quantity: 2, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
    dependencies.cartRepository.listItems.mockResolvedValue([row, { ...row, id: "campaign-line", quantity: 1 }]);
    const campaignEvidence = { priceSource: "CAMPAIGN_PROMO" as const, commercialSource: "CAMPAIGN" as const, campaignId: "offer", campaignItemId: "offer-item", publicationVersion: 1, mechanicType: "legacy_promo" as const,
      priceId: "promo", priceTypeRef: "PROMO", sourceAmount: 8.25, sourceCurrency: "USD" as const };
    dependencies.pricingService.getProductCommercialViews.mockResolvedValue([
      { ...commercial("product-1", 9.21), cartItemId: "standard-line" },
      { ...commercial("product-1", 8.25), cartItemId: "campaign-line", effectivePriceEvidence: campaignEvidence },
    ]);
    await dependencies.service.submit("user-1", input());
    const snapshot = dependencies.orderRepository.beginSubmission.mock.calls[0]![0];
    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.items[0]).toMatchObject({ cartItemId: "standard-line", quantity: 2, sourceUnitPrice: 9.21 });
    expect(snapshot.items[1]).toMatchObject({ cartItemId: "campaign-line", quantity: 1, sourceUnitPrice: 8.25, effectivePriceEvidence: campaignEvidence });
    const exported = dependencies.orderProvider.exportSalesOrder.mock.calls[0]![0];
    expect(exported.items).toHaveLength(2);
    expect(exported.items.map((item: { price: { amount: number } }) => item.price.amount)).toEqual(snapshot.items.map((item) => item.partnerUnitPrice));
    expect(dependencies.pricingService.getAuthoritativeOrderPricing).toHaveBeenCalledOnce();
  });
  it.each(["CAMPAIGN_PROMO", "CAMPAIGN_SPECIAL_PRICE"] as const)("persists %s provenance and exports the same explicit MDL line value", async (priceSource) => {
    const dependencies = makeDependencies({ useLegacyMinimalOrderPayload: true });
    const view = { ...commercial("product-1", 84), effectivePriceEvidence: { priceSource, priceTypeRef: "b9f5d585-dab1-11e9-8a58-000c29cf9dd4", priceId: "governed-promo", sourceAmount: 84, sourceCurrency: "USD" as const, campaignId: "campaign-1", campaignItemId: "item-1", publicationVersion: 2, mechanicType: "quantity_threshold_promo" as const, thresholdQuantity: 5 } };
    dependencies.pricingService.getProductCommercialViews.mockResolvedValue([view]);
    await dependencies.service.submit("user-1", input());
    const snapshot = dependencies.orderRepository.beginSubmission.mock.calls[0]![0];
    expect(snapshot.items[0]).toMatchObject({ sourceUnitPrice: 84, sourceCurrencyCode: "USD", partnerUnitPrice: 1470, effectivePriceEvidence: view.effectivePriceEvidence });
    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledWith(expect.objectContaining({ items: [expect.objectContaining({ price: { amount: 1470, currency: "MDL" } })] }));
    expect(dependencies.pricingService.getAuthoritativeOrderPricing).toHaveBeenCalledWith("user-1", ["product-1"], expect.any(String), "44444444-4444-4444-8444-444444444444");
  });


  it("exports an authoritative MDL bundle special price without treating it as USD PROMO", async () => {
    const dependencies = makeDependencies({ useLegacyMinimalOrderPayload: true });
    const evidence = { priceSource: "CAMPAIGN_SPECIAL_PRICE" as const, priceTypeRef: "governed-base", priceId: "campaign-line", sourceAmount: 1500, sourceCurrency: "MDL" as const,
      campaignId: "campaign", campaignItemId: "line", publicationVersion: 1, mechanicType: "bundle_special_price" as const, requiredBundleQuantity: 2 };
    dependencies.pricingService.getProductCommercialViews.mockResolvedValue([{ ...commercial("product-1", 1500, "MDL"), effectivePriceEvidence: evidence }]);
    await dependencies.service.submit("user-1", input());
    const snapshot = dependencies.orderRepository.beginSubmission.mock.calls[0]![0];
    expect(snapshot.items[0]).toMatchObject({ sourceUnitPrice: 1500, sourceCurrencyCode: "MDL", partnerUnitPrice: 1500, effectivePriceEvidence: evidence });
    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledWith(expect.objectContaining({ items: [expect.objectContaining({ price: { amount: 1500, currency: "MDL" } })] }));
  });

  it("returns the existing commercial conflict and never exports after PROMO eligibility is lost", async () => {
    const dependencies = makeDependencies();
    dependencies.pricingService.getAuthoritativeOrderPricing.mockRejectedValue(new EffectiveCommercialPriceChangedError());
    await expect(dependencies.service.submit("user-1", input())).rejects.toMatchObject({ code: "ORDER_PRICE_CHANGED" });
    expect(dependencies.orderRepository.beginSubmission).not.toHaveBeenCalled();
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it.each(["CAMPAIGN_PROMO", "CAMPAIGN_SPECIAL_PRICE"] as const)("checks FX freshness for USD %s even when the contract base profile is MDL", async (priceSource) => {
    const dependencies = makeDependencies();
    const config = checkoutConfiguration();
    config.publishedPriceCurrencyCode = "MDL";
    config.cashless.publishedPriceCurrencyCode = "MDL";
    config.cashless.authoritativePriceCurrencyCode = "MDL";
    dependencies.checkoutConfigurationRepository.getByCompanyId.mockResolvedValue(config);
    dependencies.commercialRateCheckoutGuard.ensureFresh.mockRejectedValue(new Error("Unavailable"));
    const view = { ...commercial("product-1", 84), effectivePriceEvidence: { priceSource, priceTypeRef: "b9f5d585-dab1-11e9-8a58-000c29cf9dd4", priceId: "governed-promo", sourceAmount: 84, sourceCurrency: "USD" as const, campaignId: "campaign-1", campaignItemId: "item-1", publicationVersion: 2, mechanicType: "quantity_threshold_promo" as const, thresholdQuantity: 5 } };
    dependencies.pricingService.getProductCommercialViews.mockResolvedValue([view]);
    await expect(dependencies.service.submit("user-1", input())).rejects.toMatchObject({ code: "ORDER_PRICE_REFRESH_FAILED" });
    expect(dependencies.commercialRateCheckoutGuard.ensureFresh).toHaveBeenCalledTimes(1);
    expect(dependencies.orderRepository.beginSubmission).not.toHaveBeenCalled();
  });

  it("maps a last-moment DB price conflict without sending an order to 1C", async () => {
    const dependencies = makeDependencies();
    dependencies.orderRepository.beginSubmission.mockRejectedValue(new OrderRepositoryError("PT409", "ORDER_PRICE_CHANGED"));
    await expect(dependencies.service.submit("user-1", input())).rejects.toMatchObject({ code: "ORDER_PRICE_CHANGED" });
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });
  it("uses partner BCRU pricing and snapshots online mode for immediate payment", async () => {
    const dependencies = makeDependencies({ useLegacyMinimalOrderPayload: true });
    await dependencies.service.submit("user-1", { ...input(), pricingMode: "rate_113_online" });

    const submittedLine = dependencies.orderRepository.beginSubmission.mock.calls[0]![0].items[0]!;
    expect(submittedLine).toMatchObject({
      partnerUnitPrice: 219,
      exchangeRatePurpose: "partner_price_usd_to_mdl",
      exchangeRateSourceType: "one_c_automatic",
    });
    expect(dependencies.orderRepository.beginSubmission.mock.calls[0]![0].payloadSnapshot).toMatchObject({
      pricingMode: "rate_113_online",
      paymentIntent: "pay_now",
      rateSnapshot: [expect.objectContaining({
        purpose: "partner_price_usd_to_mdl",
        value: 17.5,
        source: "one_c_automatic",
      })],
    });
    expect(dependencies.orderRepository.beginSubmission.mock.calls[0]![0].requestFingerprint).not.toBe("");
  });

  it("rejects reusing an idempotency key with another pricing mode", async () => {
    const dependencies = makeDependencies();
    dependencies.orderRepository.findBySubmissionKey.mockResolvedValue(order({
      status: PartnerOrderStatus.Submitted,
      payloadSnapshot: { pricingMode: "rate_113_online" },
    }));

    await expect(dependencies.service.submit("user-1", input()))
      .rejects.toMatchObject({ code: "ORDER_PAYLOAD_VALIDATION_FAILED" });
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("fails closed when online USD pricing is not backed by an automatic BCRU rate", async () => {
    const dependencies = makeDependencies();
    const view = commercial("product-1", 10);
    view.partnerPriceMdl.conversionEvidence.rateSourceType = "manual_from_1c" as "one_c_automatic";
    dependencies.pricingService.getProductCommercialViews.mockResolvedValue([view]);

    await expect(dependencies.service.submit("user-1", { ...input(), pricingMode: "rate_113_online" }))
      .rejects.toMatchObject({ code: "ORDER_PRICE_CHANGED" });
    expect(dependencies.orderRepository.beginSubmission).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("stops before pricing and export when order capability is denied", async () => {
    const dependencies = makeDependencies();
    dependencies.permissionService.ensurePermission.mockRejectedValueOnce(
      new Error("Forbidden"),
    );

    await expect(dependencies.service.submit("user-1", input())).rejects.toThrow("Forbidden");

    expect(dependencies.pricingService.getAuthoritativeOrderPricing).not.toHaveBeenCalled();
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("reloads current prices, snapshots them, exports once, and persists the returned 1C identity", async () => {
    const dependencies = makeDependencies();
    const result = await dependencies.service.submit("user-1", input());

    expect(dependencies.pricingService.getProductCommercialViews).toHaveBeenCalledWith("user-1", ["product-1"]);
    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledOnce();
    const beginInput = dependencies.orderRepository.beginSubmission.mock.calls[0][0];
    expect(beginInput.items[0]).toMatchObject({
      partnerUnitPrice: 219,
      quantity: 2,
      lineTotal: 438,
      sourceUnitPrice: 12.5,
      sourceCurrencyCode: "USD",
      appliedExchangeRate: 17.5,
    });
    expect(dependencies.orderRepository.completeSubmission).toHaveBeenCalledWith({
      orderId: "order-1", external1cRef: "77777777-7777-4777-8777-777777777777",
      external1cNumber: "NSUU-TEST", external1cDate: "2026-07-13T20:17:30.000Z",
      oneCOrderStatus: "unposted", documentTotal: 438, currencyCode: "MDL", contractNumber: "NS-296/0302/20",
      readBackResult: {},
    });
    expect(result.status).toBe(PartnerOrderStatus.Submitted);
    expect(dependencies.priceRefreshService.refresh).not.toHaveBeenCalled();
  });

  it("re-reads a stale checkout projection once and completes the same submit intent", async () => {
    const dependencies = makeDependencies();
    dependencies.checkoutConfigurationRepository.getByCompanyId
      .mockResolvedValueOnce({
        ...checkoutConfiguration(),
        cashless: {
          ...checkoutConfiguration().cashless!,
          publishedPriceCurrencyRef: null,
        },
      })
      .mockResolvedValueOnce(checkoutConfiguration());

    await expect(dependencies.service.submit("user-1", input())).resolves.toMatchObject({
      status: PartnerOrderStatus.Submitted,
    });

    expect(dependencies.checkoutConfigurationRepository.getByCompanyId).toHaveBeenCalledTimes(2);
    expect(dependencies.orderRepository.beginSubmission).toHaveBeenCalledOnce();
    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledOnce();
  });

  it("caps stale checkout projection recovery at one re-read", async () => {
    const dependencies = makeDependencies();
    const stale = {
      ...checkoutConfiguration(),
      cashless: {
        ...checkoutConfiguration().cashless!,
        publishedPriceCurrencyRef: null,
      },
    };
    dependencies.checkoutConfigurationRepository.getByCompanyId.mockResolvedValue(stale);

    await expect(dependencies.service.submit("user-1", input())).rejects.toMatchObject({
      code: "ORDER_PAYMENT_METHOD_UNAVAILABLE",
    });

    expect(dependencies.checkoutConfigurationRepository.getByCompanyId).toHaveBeenCalledTimes(2);
    expect(dependencies.orderRepository.beginSubmission).not.toHaveBeenCalled();
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("uses the server cart revision after the mutation barrier", async () => {
    const dependencies = makeDependencies();
    dependencies.cartRepository.findActive.mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
      companyId: "company-1",
      createdBy: "user-1",
      status: "active",
      intentVersion: 8,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    });

    await dependencies.service.submit("user-1", input());

    expect(dependencies.orderRepository.beginSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ expectedIntentVersion: 8 }),
    );
    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledOnce();
  });

  it("blocks submission when the current partner price is older than the accepted window", async () => {
    const dependencies = makeDependencies();
    dependencies.pricingService.getProductCommercialViews.mockResolvedValue([{
      ...commercial("product-1", 12.5),
      partnerPrice: { amount: 12.5, currencyCode: "USD", formattedAmount: "$12.50", lastUpdatedAt: new Date(Date.now() - 37 * 60 * 60 * 1000).toISOString() },
    }]);
    await expect(dependencies.service.submit("user-1", input())).rejects.toBeInstanceOf(RecoverableOrderSubmissionError);
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("bulk refreshes one stale price and continues when the verified price is unchanged", async () => {
    const dependencies = makeDependencies();
    const stale = {
      ...commercial("product-1", 12.5),
      partnerPrice: { amount: 12.5, currencyCode: "USD", formattedAmount: "$12.50", lastUpdatedAt: new Date(Date.now() - 37 * 60 * 60 * 1000).toISOString() },
    };
    dependencies.pricingService.getProductCommercialViews
      .mockResolvedValueOnce([stale])
      .mockResolvedValueOnce([commercial("product-1", 12.5)]);

    await expect(dependencies.service.submit("user-1", input())).resolves.toMatchObject({
      status: PartnerOrderStatus.Submitted,
    });

    expect(dependencies.priceRefreshService.refresh).toHaveBeenCalledWith({
      externalPriceTypeRef: "33333333-3333-4333-8333-333333333333",
      externalProductRefs: ["66666666-6666-4666-8666-666666666666"],
    });
    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledOnce();
  });

  it("refreshes multiple stale lines in one bulk operation", async () => {
    const dependencies = makeDependencies();
    dependencies.cartRepository.listItems.mockResolvedValue([
      cartItem("product-1", 1),
      cartItem("product-2", 2),
    ]);
    dependencies.catalogService.getProductOrderIdentities.mockResolvedValue([
      identity("product-1", "SKU-1", "66666666-6666-4666-8666-666666666666"),
      identity("product-2", "SKU-2", "77777777-7777-4777-8777-777777777777"),
    ]);
    const staleAt = new Date(Date.now() - 37 * 60 * 60 * 1000).toISOString();
    dependencies.pricingService.getProductCommercialViews
      .mockResolvedValueOnce([
        withPriceUpdatedAt(commercial("product-1", 12.5), staleAt),
        withPriceUpdatedAt(commercial("product-2", 20), staleAt),
      ])
      .mockResolvedValueOnce([commercial("product-1", 12.5), commercial("product-2", 20)]);

    await dependencies.service.submit("user-1", input());

    expect(dependencies.priceRefreshService.refresh).toHaveBeenCalledOnce();
    expect(dependencies.priceRefreshService.refresh).toHaveBeenCalledWith(expect.objectContaining({
      externalProductRefs: [
        "66666666-6666-4666-8666-666666666666",
        "77777777-7777-4777-8777-777777777777",
      ],
    }));
  });

  it("requires partner confirmation when the authoritative refreshed price changed", async () => {
    const dependencies = makeDependencies();
    const staleAt = new Date(Date.now() - 37 * 60 * 60 * 1000).toISOString();
    dependencies.pricingService.getProductCommercialViews
      .mockResolvedValueOnce([withPriceUpdatedAt(commercial("product-1", 12.5), staleAt)])
      .mockResolvedValueOnce([commercial("product-1", 13)]);

    await expect(dependencies.service.submit("user-1", input())).rejects.toMatchObject({
      code: "ORDER_PRICE_CHANGED",
    });
    expect(dependencies.orderRepository.beginSubmission).not.toHaveBeenCalled();
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("lets a retail-only employee order with the refreshed hidden company price", async () => {
    const dependencies = makeDependencies({ commercialMode: "retail_only" });
    const staleAt = new Date(Date.now() - 37 * 60 * 60 * 1000).toISOString();
    dependencies.pricingService.getProductCommercialViews
      .mockResolvedValueOnce([withPriceUpdatedAt(commercial("product-1", 12.5), staleAt)])
      .mockResolvedValueOnce([commercial("product-1", 13)]);

    await expect(dependencies.service.submit("user-1", input())).resolves.toMatchObject({
      status: PartnerOrderStatus.Submitted,
    });

    expect(dependencies.orderRepository.beginSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ partnerUnitPrice: 228, lineTotal: 456 })],
      }),
    );
    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        documentTotal: 456,
        items: [expect.objectContaining({ price: { amount: 228, currency: "MDL" } })],
      }),
    );
    expect(console.info).toHaveBeenCalledWith(expect.objectContaining({
      event: "partner_order_hidden_price_refresh_accepted",
      commercialMode: "retail_only",
      changedProductCount: 1,
    }));
  });

  it("preserves the cart when authoritative price refresh fails", async () => {
    const dependencies = makeDependencies();
    dependencies.pricingService.getProductCommercialViews.mockResolvedValue([
      withPriceUpdatedAt(commercial("product-1", 12.5), new Date(Date.now() - 37 * 60 * 60 * 1000).toISOString()),
    ]);
    dependencies.priceRefreshService.refresh.mockRejectedValue(new Error("1C timeout"));

    await expect(dependencies.service.submit("user-1", input())).rejects.toMatchObject({
      code: "ORDER_PRICE_REFRESH_FAILED",
    });
    expect(dependencies.orderRepository.beginSubmission).not.toHaveBeenCalled();
    expect(dependencies.cartRepository).not.toHaveProperty("clear");
  });

  it("warns for stale stock without adding a live 1C preflight call", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const dependencies = makeDependencies();
    dependencies.pricingService.getProductCommercialViews.mockResolvedValue([{
      ...commercial("product-1", 12.5),
      stock: { exactAvailableQuantity: 5, expectedArrival: null, lastUpdatedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString() },
    }]);
    await dependencies.service.submit("user-1", input());
    expect(warning).toHaveBeenCalledWith(expect.objectContaining({ event: "partner_order_preflight_warning", warning: "stale_stock" }));
    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledTimes(1);
  });

  it.each(["2026-07-31", "2026-10-25"])(
    "preserves the date-only shipment value %s across month and DST boundaries",
    async (requestedDeliveryDate) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-29T10:00:00.000Z"));
      try {
        const dependencies = makeDependencies();

        await dependencies.service.submit("user-1", {
          ...input(),
          requestedDeliveryDate,
        });

        expect(dependencies.orderRepository.beginSubmission).toHaveBeenCalledWith(
          expect.objectContaining({ requestedDeliveryDate }),
        );
        expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledWith(
          expect.objectContaining({ requestedDeliveryDate }),
        );
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("converts authoritative USD prices to governed MDL in legacy-minimal mode", async () => {
    const dependencies = makeDependencies({ useLegacyMinimalOrderPayload: true });

    await dependencies.service.submit("user-1", input());

    expect(dependencies.pricingService.getAuthoritativeUsdMdlRateSnapshot)
      .not.toHaveBeenCalled();
    expect(dependencies.pricingService.getApprovedUsdMdlRate).not.toHaveBeenCalled();
    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledWith(expect.objectContaining({
      currency: "MDL",
      currencyReference: expect.objectContaining({ externalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }),
      priceTypeReference: expect.objectContaining({ externalId: "33333333-3333-4333-8333-333333333333" }),
      documentTotal: 438,
      items: [expect.objectContaining({
        price: { amount: 219, currency: "MDL" },
        quantity: 2,
        lineTotal: 438,
      })],
    }));
    expect(dependencies.orderRepository.beginSubmission.mock.calls[0][0].items[0]).toMatchObject({
      partnerUnitPrice: 219,
      currencyCode: "MDL",
      lineTotal: 438,
      sourceUnitPrice: 12.5,
      sourceCurrencyCode: "USD",
      appliedExchangeRate: 17.5,
      exchangeRateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });

  it("converts every current USD cart line to one authoritative MDL total", async () => {
    const dependencies = makeDependencies({ useLegacyMinimalOrderPayload: true });
    dependencies.cartRepository.listItems.mockResolvedValue([
      cartItem("product-1", 1), cartItem("product-2", 1),
      cartItem("product-3", 610), cartItem("product-4", 1),
    ]);
    dependencies.catalogService.getProductOrderIdentities.mockResolvedValue([
      identity("product-1", "400691", "9a5c59b8-0293-11f1-d58d-7239d3b7bd5c"),
      identity("product-2", "400525", "f9bf8b60-e5c5-11ee-6a9e-7239d3b7bd5c"),
      identity("product-3", "300011", "17269332-c968-11e9-be26-000c29cf9dd4"),
      identity("product-4", "190084", "414cd1d6-6d6e-11ec-6395-7239d3b7bd5c"),
    ]);
    dependencies.pricingService.getProductCommercialViews.mockResolvedValue([
      commercial("product-1", 102.08), commercial("product-2", 198),
      commercial("product-3", 0.26), commercial("product-4", 504.9),
    ]);
    dependencies.pricingService.getApprovedUsdMdlRate.mockResolvedValue(17.563414);

    await dependencies.service.submit("user-1", input());

    const exported = dependencies.orderProvider.exportSalesOrder.mock.calls[0][0];
    expect(exported.items).toHaveLength(4);
    expect(exported.items.map((item: { quantity: number; price: { amount: number }; lineTotal: number }) => ({
      quantity: item.quantity,
      price: item.price.amount,
      total: item.lineTotal,
    }))).toEqual([
      { quantity: 1, price: 1786, total: 1786 },
      { quantity: 1, price: 3465, total: 3465 },
      { quantity: 610, price: 5, total: 3050 },
      { quantity: 1, price: 8836, total: 8836 },
    ]);
    expect(exported.documentTotal).toBe(17137);
    expect(exported.items[2].lineTotal).toBe(3050);
  });

  it("rejects a missing line or header mismatch in the legacy preflight invariant", () => {
    const validOrder = {
      items: [{ quantity: 1, price: { amount: 100 }, lineTotal: 100 }],
      documentTotal: 99,
    };

    expect(() => assertLegacyExportIntegrity(1, validOrder as never))
      .toThrow(RecoverableOrderSubmissionError);
    expect(() => assertLegacyExportIntegrity(2, { ...validOrder, documentTotal: 100 } as never))
      .toThrow(RecoverableOrderSubmissionError);
  });

  it("fails closed when a USD source price has no governed MDL projection", async () => {
    const dependencies = makeDependencies({ useLegacyMinimalOrderPayload: true });
    dependencies.pricingService.getProductCommercialViews.mockResolvedValue([{
      ...commercial("product-1", 12.5),
      partnerCheckoutPriceMdl: null,
    }]);

    await expect(dependencies.service.submit("user-1", input()))
      .rejects.toMatchObject({ code: "ORDER_PRICE_CHANGED" });

    expect(dependencies.orderRepository.beginSubmission).not.toHaveBeenCalled();
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("fails closed when conversion evidence does not match the source price", async () => {
    const dependencies = makeDependencies({ useLegacyMinimalOrderPayload: true });
    const view = commercial("product-1", 12.5);
    dependencies.pricingService.getProductCommercialViews.mockResolvedValue([{
      ...view,
      partnerCheckoutPriceMdl: {
        ...view.partnerCheckoutPriceMdl,
        conversionEvidence: {
          ...view.partnerCheckoutPriceMdl.conversionEvidence,
          sourceAmount: 11.5,
        },
      },
    }]);

    await expect(dependencies.service.submit("user-1", input()))
      .rejects.toMatchObject({ code: "ORDER_PRICE_CHANGED" });
    expect(dependencies.orderRepository.beginSubmission).not.toHaveBeenCalled();
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
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
      commercialViewFound: true,
      partnerPriceFound: true,
      partnerPriceCurrencyResolved: true,
      partnerPriceAmountValid: true,
      partnerPriceFresh: true,
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

  it("blocks submission when the local company contract mapping is missing", async () => {
    const dependencies = makeDependencies();
    dependencies.company.external1cContractId = null;
    await expect(dependencies.service.submit("user-1", input())).rejects.toMatchObject({
      code: "ORDER_CONTRACT_MAPPING_MISSING",
    });
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
    expect(dependencies.partnerProvider.resolveCustomerOrderContract).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.objectContaining({
      event: "partner_order_submission_failed",
      stage: "contract_mapping",
      adminResolutionPath: "/admin/companies/company-1?tab=integration",
    }));
  });

  it("accepts a valid non-RFC 1C contract GUID from the governed local mapping", async () => {
    const dependencies = makeDependencies();
    dependencies.company.external1cContractId = "e5baa428-8919-11ee-129a-7239d3b7bd5c";
    dependencies.checkoutConfigurationRepository.getByCompanyId.mockResolvedValue({
      ...checkoutConfiguration(),
      cashless: {
        ...checkoutConfiguration().cashless!,
        contractRef: "e5baa428-8919-11ee-129a-7239d3b7bd5c",
      },
    });

    await dependencies.service.submit("user-1", input());

    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        contractReference: expect.objectContaining({
          externalId: "e5baa428-8919-11ee-129a-7239d3b7bd5c",
        }),
      }),
    );
  });

  it("uses the governed local price type currency without a live 1C lookup", async () => {
    const dependencies = makeDependencies();

    await dependencies.service.submit("user-1", input());

    expect(dependencies.partnerProvider.fetchPriceType).not.toHaveBeenCalled();
    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        currencyReference: expect.objectContaining({
          externalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        }),
      }),
    );
  });

  it("reprices cash checkout with the governed cash contract price type", async () => {
    const dependencies = makeDependencies();
    const cashPriceTypeRef = "88888888-8888-4888-8888-888888888888";
    dependencies.checkoutConfigurationRepository.getByCompanyId.mockResolvedValue({
      ...checkoutConfiguration(),
      cash: {
        ...checkoutConfiguration().cashless!,
        contractRef: "77777777-7777-4777-8777-777777777777",
        number: "CASH-1",
        priceTypeRef: cashPriceTypeRef,
      },
    });

    await dependencies.service.submit("user-1", { ...input(), paymentMethod: "cash" });

    expect(dependencies.pricingService.getAuthoritativeOrderPricing)
      .toHaveBeenCalledWith("user-1", ["product-1"], cashPriceTypeRef, "44444444-4444-4444-8444-444444444444");
    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        contractReference: expect.objectContaining({ externalId: "77777777-7777-4777-8777-777777777777" }),
        priceTypeReference: expect.objectContaining({ externalId: cashPriceTypeRef }),
      }),
    );
  });

  it("exports the manually selected payment date independently from shipment date", async () => {
    const dependencies = makeDependencies();

    await dependencies.service.submit("user-1", {
      ...input(),
      paymentDate: "2099-01-09",
      requestedDeliveryDate: "2099-01-10",
    });

    expect(dependencies.orderProvider.exportSalesOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        plannedPaymentDate: "2099-01-09",
        requestedDeliveryDate: "2099-01-10",
      }),
    );
  });

  it("rejects a missing payment date before any 1C export", async () => {
    const dependencies = makeDependencies();

    await expect(dependencies.service.submit("user-1", {
      ...input(),
      paymentDate: "",
    })).rejects.toMatchObject({ code: "ORDER_INVALID_PAYMENT_DATE" });
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("rejects a malformed calendar payment date before any 1C export", async () => {
    const dependencies = makeDependencies();

    await expect(dependencies.service.submit("user-1", {
      ...input(),
      paymentDate: "2099-02-31",
    })).rejects.toMatchObject({ code: "ORDER_INVALID_PAYMENT_DATE" });
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("fails closed when the governed local checkout currency is unavailable", async () => {
    const dependencies = makeDependencies();
    dependencies.checkoutConfigurationRepository.getByCompanyId.mockResolvedValue({
      ...checkoutConfiguration(),
      cashless: { ...checkoutConfiguration().cashless!, publishedPriceCurrencyRef: "" },
    });

    await expect(dependencies.service.submit("user-1", input())).rejects.toMatchObject({
      code: "ORDER_PAYMENT_METHOD_UNAVAILABLE",
    });
    expect(dependencies.orderRepository.beginSubmission).not.toHaveBeenCalled();
    expect(dependencies.partnerProvider.fetchPriceType).not.toHaveBeenCalled();
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("fails closed when line prices do not use the governed published price currency", async () => {
    const dependencies = makeDependencies();
    dependencies.pricingService.getProductCommercialViews.mockResolvedValue([
      commercial("product-1", 12.5, "MDL"),
    ]);

    await expect(dependencies.service.submit("user-1", input())).rejects.toMatchObject({
      code: "ORDER_PRICE_CHANGED",
    });
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("preserves the cart and marks a rejected 1C write as failed", async () => {
    const dependencies = makeDependencies();
    dependencies.orderProvider.exportSalesOrder.mockRejectedValue(new IntegrationHttpError());
    await expect(dependencies.service.submit("user-1", input())).rejects.toBeInstanceOf(RecoverableOrderSubmissionError);
    expect(dependencies.orderRepository.failSubmission).toHaveBeenCalledWith(expect.objectContaining({ orderId: "order-1", status: PartnerOrderStatus.Failed }));
    expect(dependencies.orderRepository.completeSubmission).not.toHaveBeenCalled();
  });

  it("maps only the dedicated database marker to a cart intent conflict", async () => {
    const dependencies = makeDependencies();
    dependencies.orderRepository.beginSubmission.mockRejectedValue(
      new OrderRepositoryError("P0001", "CART_INTENT_VERSION_CONFLICT"),
    );

    await expect(dependencies.service.submit("user-1", input())).rejects
      .toMatchObject({ code: "ORDER_CART_VERSION_CONFLICT" });
  });

  it("retains a typed payload failure from the submission preparation boundary", async () => {
    const dependencies = makeDependencies();
    dependencies.orderRepository.beginSubmission.mockRejectedValue(
      new OrderRepositoryError("23514", "Order submission is invalid."),
    );

    await expect(dependencies.service.submit("user-1", input())).rejects
      .toMatchObject({ code: "ORDER_PAYLOAD_VALIDATION_FAILED" });
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("retains a typed contract failure returned by the submission validator", async () => {
    const dependencies = makeDependencies();
    dependencies.orderRepository.beginSubmission.mockRejectedValue(
      new OrderRepositoryError("PT409", "ORDER_CONTRACT_INVALID"),
    );

    await expect(dependencies.service.submit("user-1", input())).rejects
      .toMatchObject({ code: "ORDER_CONTRACT_INVALID" });
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("maps the legacy cash contract guard to the same typed contract failure", async () => {
    const dependencies = makeDependencies();
    dependencies.orderRepository.beginSubmission.mockRejectedValue(
      new OrderRepositoryError("23514", "Order contract mapping is invalid."),
    );

    await expect(dependencies.service.submit("user-1", input())).rejects
      .toMatchObject({ code: "ORDER_CONTRACT_INVALID" });
  });

  it("builds a valid governed cash payload for a physical-person counterparty", async () => {
    const dependencies = makeDependencies();
    const config = checkoutConfiguration();
    dependencies.checkoutConfigurationRepository.getByCompanyId.mockResolvedValue({
      ...config,
      counterpartyTypeCode: "ФизическоеЛицо",
      cashDiagnosticCode: "CASH_CONTRACT_QUALIFIED",
      cash: {
        ...config.cashless,
        name: "Cash contract",
        number: "CASH-1",
        contractRef: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        settlementCurrencyRef: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        settlementCurrencyCode: "MDL",
        authoritativePriceCurrencyRef: "44444444-4444-4444-8444-444444444444",
        authoritativePriceCurrencyCode: "USD",
        publishedPriceCurrencyRef: "44444444-4444-4444-8444-444444444444",
        publishedPriceCurrencyCode: "USD",
      },
    });

    await dependencies.service.submit("user-1", {
      ...input(),
      paymentMethod: "cash",
      notificationLocale: "ro",
    });

    expect(dependencies.orderRepository.beginSubmission).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethod: "cash",
        payloadSnapshot: expect.objectContaining({
          notificationLocale: "ro",
          contractReference: expect.objectContaining({
            externalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          }),
          currencyReference: expect.objectContaining({
            externalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          }),
        }),
      }),
    );
  });

  it("classifies a missing database function as an infrastructure failure", async () => {
    const dependencies = makeDependencies();
    dependencies.orderRepository.beginSubmission.mockRejectedValue(
      new OrderRepositoryError("42883", "function digest(text, unknown) does not exist"),
    );

    await expect(dependencies.service.submit("user-1", input())).rejects
      .toMatchObject({ code: "ORDER_SUBMISSION_INFRASTRUCTURE_FAILURE" });
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
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

  it("uses the mapped local 1C customer contract without a live contract lookup", async () => {
    const dependencies = makeDependencies();
    await dependencies.service.submit("user-1", input());
    expect(dependencies.partnerProvider.resolveCustomerOrderContract).not.toHaveBeenCalled();
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

  it("reconciliation completes a single verified 1C match without another export", async () => {
    const dependencies = makeDependencies();
    const pending = order({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: PartnerOrderStatus.Unknown, integrationStatus: PartnerOrderIntegrationStatus.ReconciliationRequired });
    dependencies.orderRepository.findById.mockResolvedValue(pending);
    dependencies.orderRepository.listItems.mockResolvedValue([orderItem()]);
    const match = {
      ...exportResult(),
      readBack: {
        priceTypeRef: "99999999-9999-4999-8999-999999999999",
        paymentMethod: "cashless" as const,
        plannedPaymentDate: "2099-01-09",
        fulfillmentMethod: "pickup" as const,
        carrierRef: null,
        paymentAmount: 25,
        paymentVatAmount: 4.17,
      },
    };
    dependencies.orderProvider.findExportedSalesOrders.mockResolvedValue([match]);

    const result = await dependencies.service.reconcileInternal(pending.id);

    expect(result.status).toBe(PartnerOrderStatus.Submitted);
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
    expect(dependencies.orderRepository.completeSubmission).toHaveBeenCalledWith(expect.objectContaining({
      orderId: pending.id,
      external1cNumber: "NSUU-TEST",
      readBackResult: match.readBack,
    }));
  });

  it("reconciliation confirms no 1C order and reopens through the repository RPC", async () => {
    const dependencies = makeDependencies();
    const pending = order({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: PartnerOrderStatus.Unknown, integrationStatus: PartnerOrderIntegrationStatus.ReconciliationRequired });
    dependencies.orderRepository.findById.mockResolvedValue(pending);
    dependencies.orderProvider.findExportedSalesOrders.mockResolvedValue([]);

    await dependencies.service.reconcileInternal(pending.id);

    expect(dependencies.orderRepository.confirmNotCreated).toHaveBeenCalledWith({ orderId: pending.id, submissionKey: pending.submissionKey });
    expect(dependencies.orderRepository.completeSubmission).not.toHaveBeenCalled();
  });

  it("reconciliation sends multiple matches to manual review", async () => {
    const dependencies = makeDependencies();
    const pending = order({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", status: PartnerOrderStatus.Unknown, integrationStatus: PartnerOrderIntegrationStatus.ReconciliationRequired });
    dependencies.orderRepository.findById.mockResolvedValue(pending);
    dependencies.orderProvider.findExportedSalesOrders.mockResolvedValue([exportResult(), exportResult()]);

    await dependencies.service.reconcileInternal(pending.id);

    expect(dependencies.orderRepository.markManualReviewRequired).toHaveBeenCalledWith(pending.id);
    expect(dependencies.orderRepository.completeSubmission).not.toHaveBeenCalled();
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

  it("loads order summaries with one bulk item read and newest repository order", async () => {
    const dependencies = makeDependencies();
    const confirmed = order({ status: PartnerOrderStatus.Submitted, integrationStatus: PartnerOrderIntegrationStatus.Confirmed, documentTotal: 25, currencyCode: "USD" });
    dependencies.orderRepository.listByCompanyId.mockResolvedValue([confirmed]);
    dependencies.orderRepository.listItemsByOrderIds.mockResolvedValue([orderItem()]);

    const result = await dependencies.service.listOwnCompanyOrders("user-1");

    expect(dependencies.orderRepository.listItemsByOrderIds).toHaveBeenCalledWith([confirmed.id]);
    expect(dependencies.orderRepository.listItems).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({ positionCount: 1, totalUnitCount: 2, integrationStatus: PartnerOrderIntegrationStatus.Confirmed });
  });

  it("returns not found before reading lines for another company order", async () => {
    const dependencies = makeDependencies();
    dependencies.orderRepository.findById.mockResolvedValue(order({ companyId: "other-company" }));

    await expect(dependencies.service.getOrder("user-1", "order-1")).rejects.toThrow("Order was not found.");
    expect(dependencies.orderRepository.listItems).not.toHaveBeenCalled();
  });

  it.each([
    [PartnerOrderStatus.Unknown, PartnerOrderIntegrationStatus.ReconciliationRequired, 0, "checking"],
    [PartnerOrderStatus.Unknown, PartnerOrderIntegrationStatus.ReconciliationRequired, 2, "unknown_retrying"],
    [PartnerOrderStatus.Submitted, PartnerOrderIntegrationStatus.Confirmed, 0, "confirmed_created"],
    [PartnerOrderStatus.Failed, PartnerOrderIntegrationStatus.ConfirmedNotCreated, 3, "confirmed_not_created"],
  ] as const)(
    "maps %s/%s after %s attempts to the partner reconciliation state %s",
    async (status, integrationStatus, reconciliationAttemptCount, expected) => {
      const dependencies = makeDependencies();
      dependencies.orderRepository.findById.mockResolvedValue(order({
        status,
        integrationStatus,
        reconciliationAttemptCount,
      }));

      const result = await dependencies.service.getReconciliationState("user-1", "order-1");

      expect(result).toMatchObject({ orderId: "order-1", state: expected });
      expect(dependencies.orderRepository.listItems).not.toHaveBeenCalled();
      expect(dependencies.orderProvider.findExportedSalesOrders).not.toHaveBeenCalled();
    },
  );

  it("does not expose another company's reconciliation state", async () => {
    const dependencies = makeDependencies();
    dependencies.orderRepository.findById.mockResolvedValue(order({ companyId: "other-company" }));

    await expect(
      dependencies.service.getReconciliationState("user-1", "order-1"),
    ).rejects.toThrow("Order was not found.");
  });

  it("requires the partner to review a cart repriced by a targeted rate refresh", async () => {
    const dependencies = makeDependencies();
    dependencies.commercialRateCheckoutGuard.ensureFresh.mockResolvedValue({
      retailRateId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      checkedAt: new Date().toISOString(),
      refreshed: true,
    });
    await expect(dependencies.service.submit("user-1", input())).rejects.toMatchObject({ code: "ORDER_PRICE_CHANGED" });
    expect(dependencies.pricingService.getAuthoritativeOrderPricing).not.toHaveBeenCalled();
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });

  it("fails closed before export when authoritative rate freshness cannot be proven", async () => {
    const dependencies = makeDependencies();
    dependencies.commercialRateCheckoutGuard.ensureFresh.mockRejectedValue(Object.assign(new Error("unavailable"), { correlationId: "rate-correlation" }));
    await expect(dependencies.service.submit("user-1", input())).rejects.toMatchObject({ code: "ORDER_PRICE_REFRESH_FAILED", correlationId: "rate-correlation" });
    expect(dependencies.orderProvider.exportSalesOrder).not.toHaveBeenCalled();
  });
});

function makeDependencies(options: {
  useLegacyMinimalOrderPayload?: boolean;
  commercialMode?: "full" | "retail_only" | "hidden";
} = {}) {
  const cartRepository = {
    findActive: vi.fn().mockResolvedValue({ id: "44444444-4444-4444-8444-444444444444", companyId: "company-1", createdBy: "user-1", status: "active", intentVersion: 7, createdAt: "2026-01-01", updatedAt: "2026-01-01" }),
    listItems: vi.fn().mockResolvedValue([{ id: "item-1", cartId: "cart-1", productId: "product-1", quantity: 2, createdAt: "2026-01-01", updatedAt: "2026-01-01" }]),
  };
  const orderRepository = {
    findBySubmissionKey: vi.fn().mockResolvedValue(null), listByCompanyId: vi.fn(), findById: vi.fn(), listItems: vi.fn(), listItemsByOrderIds: vi.fn(),
    beginSubmission: vi.fn(async (value: Parameters<PartnerOrderRepository["beginSubmission"]>[0]) => order({ submissionAttemptId: value.submissionAttemptId })),
    completeSubmission: vi.fn().mockResolvedValue(order({ status: PartnerOrderStatus.Submitted, external1cRef: "77777777-7777-4777-8777-777777777777", external1cNumber: "NSUU-TEST" })),
    failSubmission: vi.fn().mockResolvedValue(order({ status: PartnerOrderStatus.Failed })),
    confirmNotCreated: vi.fn().mockResolvedValue(order({ status: PartnerOrderStatus.Failed, integrationStatus: PartnerOrderIntegrationStatus.ConfirmedNotCreated })),
    markManualReviewRequired: vi.fn().mockResolvedValue(order({ status: PartnerOrderStatus.Unknown, integrationStatus: PartnerOrderIntegrationStatus.ManualReviewRequired })),
  };
  const company: { id: string; displayName: string; external1cId: string; external1cContractId: string | null; external1cPriceTypeId: string } = {
    id: "company-1", displayName: "Partner Company", external1cId: "11111111-1111-4111-8111-111111111111",
    external1cContractId: "22222222-2222-4222-8222-222222222222", external1cPriceTypeId: "33333333-3333-4333-8333-333333333333",
  };
  const companyAccessService = { getOwnMemberships: vi.fn().mockResolvedValue([{ companyId: "company-1", status: "active" }]), getActiveCompanyContext: vi.fn().mockResolvedValue({ company }) };
  const permissionService = { ensurePermission: vi.fn().mockResolvedValue({ isAllowed: true }) };
  const catalogService = { getProductOrderIdentities: vi.fn().mockResolvedValue([{ id: "product-1", external1cId: "66666666-6666-4666-8666-666666666666", sku: "SKU-1", name: "Camera" }]) };
  const getProductCommercialViews = vi.fn().mockResolvedValue([commercial("product-1", 12.5)]);
  const pricingService = {
    getProductCommercialViews,
    getAuthoritativeOrderPricing: vi.fn(async (userId: string, productIds: string[]) => ({
      commercialMode: options.commercialMode ?? "full",
      views: await getProductCommercialViews(userId, productIds),
    })),
    getAuthoritativeUsdMdlRateSnapshot: vi.fn().mockResolvedValue({
      sourceCode: "113",
      mdlPerUsdRate: 17.56341414,
      effectiveDate: "2026-08-11",
      publishedAt: new Date().toISOString(),
    }),
    getApprovedUsdMdlRate: vi.fn().mockResolvedValue(17.56341414),
  };
  const partnerProvider = {
    fetchPartnerContracts: vi.fn().mockResolvedValue({ items: [{ reference: ref("22222222-2222-4222-8222-222222222222"), active: true, organizationReference: ref("4643d461-aa49-4b70-9486-a59f80ee6af8") }], nextCursor: null, sourceTimestamp: null }),
    resolveCustomerOrderContract: vi.fn().mockResolvedValue({ reference: ref("22222222-2222-4222-8222-222222222222"), active: true, organizationReference: ref("4643d461-aa49-4b70-9486-a59f80ee6af8") }),
    fetchPriceType: vi.fn().mockResolvedValue({ active: true, currency: "44444444-4444-4444-8444-444444444444" }),
  };
  const checkoutConfigurationRepository = {
    getByCompanyId: vi.fn().mockResolvedValue(checkoutConfiguration()),
  };
  const orderProvider = { exportSalesOrder: vi.fn().mockResolvedValue(exportResult()), findExportedSalesOrders: vi.fn() };
  const priceRefreshService = { refresh: vi.fn().mockResolvedValue({ verifiedAt: new Date().toISOString(), productCount: 1, providerRequestCount: 1, deduplicated: false, durationMs: 25 }) };
  const commercialRateCheckoutGuard = { ensureFresh: vi.fn().mockResolvedValue({ retailRateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", checkedAt: new Date().toISOString(), refreshed: false }) };
  const service = new DefaultPartnerOrderService(cartRepository as never, orderRepository as never, companyAccessService as never, permissionService as never, catalogService as never, pricingService as never, partnerProvider as never, orderProvider as never, options, priceRefreshService, checkoutConfigurationRepository as never, commercialRateCheckoutGuard);
  return { service, cartRepository, orderRepository, catalogService, pricingService, partnerProvider, orderProvider, priceRefreshService, checkoutConfigurationRepository, commercialRateCheckoutGuard, permissionService, company };
}

function checkoutConfiguration() {
  return {
    companyId: "company-1",
    counterpartyTypeCode: "\u042e\u0440\u0438\u0434\u0438\u0447\u0435\u0441\u043a\u043e\u0435\u041b\u0438\u0446\u043e",
    governmentBodyTypeCode: null,
    counterpartyActive: true,
    counterpartyRef: "11111111-1111-4111-8111-111111111111",
    priceTypeRef: "33333333-3333-4333-8333-333333333333",
    publishedPriceCurrencyRef: "44444444-4444-4444-8444-444444444444",
    publishedPriceCurrencyCode: "USD",
    cashDiagnosticCode: "CASH_MAPPING_MISSING",
    cashless: {
      contractRef: "22222222-2222-4222-8222-222222222222",
      name: "NS-296/0302/20",
      number: "NS-296/0302/20",
      active: true,
      contractType: "\u0421 \u043f\u043e\u043a\u0443\u043f\u0430\u0442\u0435\u043b\u0435\u043c",
      organizationRef: "4643d461-aa49-4b70-9486-a59f80ee6af8",
      priceTypeRef: "33333333-3333-4333-8333-333333333333",
      settlementCurrencyRef: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      settlementCurrencyCode: "MDL",
      authoritativePriceCurrencyRef: "44444444-4444-4444-8444-444444444444",
      authoritativePriceCurrencyCode: "USD",
      publishedPriceCurrencyRef: "44444444-4444-4444-8444-444444444444",
      publishedPriceCurrencyCode: "USD",
    },
    cash: null,
    carriers: [],
  };
}

function input() {
  return {
    cartId: "44444444-4444-4444-8444-444444444444",
    expectedIntentVersion: 7,
    submissionKey: SUBMISSION_KEY,
    expectedCommercialRateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    requestedDeliveryDate: "2099-01-10",
    paymentMethod: "cashless" as const,
    paymentDate: "2099-01-09",
    fulfillmentMethod: "pickup" as const,
    carrierId: null,
  };
}
function ref(externalId: string) { return { providerCode: "one-c", externalId, externalType: "test" }; }
function cartItem(productId: string, quantity: number) { return { id: `item-${productId}`, cartId: "cart-1", productId, quantity, createdAt: "2026-01-01", updatedAt: "2026-01-01" }; }
function identity(id: string, sku: string, external1cId: string) { return { id, sku, external1cId, name: sku }; }
function commercial(productId: string, amount: number, sourceCurrencyCode: "USD" | "MDL" = "USD") {
  const converted = sourceCurrencyCode === "USD"
    ? new Decimal(amount).times("17.5").toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber()
    : amount;
  const now = new Date().toISOString();
  return {
    productId,
    partnerPrice: { amount, currencyCode: sourceCurrencyCode, formattedAmount: null, lastUpdatedAt: now },
    partnerPriceMdl: {
      amount: converted,
      currencyCode: "MDL",
      formattedAmount: null,
      lastUpdatedAt: now,
      conversionEvidence: {
        sourceAmount: amount,
        sourceCurrencyCode,
        appliedRate: sourceCurrencyCode === "USD" ? 17.5 : null,
        rateId: sourceCurrencyCode === "USD" ? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" : null,
        ratePurpose: sourceCurrencyCode === "USD" ? "partner_price_usd_to_mdl" as const : null,
        rateSourceType: sourceCurrencyCode === "USD" ? "one_c_automatic" as const : null,
        rateEffectiveAt: sourceCurrencyCode === "USD" ? "2026-09-20T00:00:00.000Z" : null,
        ratePublishedAt: sourceCurrencyCode === "USD" ? "2026-09-20T10:00:00.000Z" : null,
        resultingAmount: converted,
        resultingCurrencyCode: "MDL" as const,
      },
    },
    partnerCheckoutPriceMdl: {
      amount: converted,
      currencyCode: "MDL",
      formattedAmount: null,
      lastUpdatedAt: now,
      conversionEvidence: {
        sourceAmount: amount,
        sourceCurrencyCode,
        appliedRate: sourceCurrencyCode === "USD" ? 17.5 : null,
        rateId: sourceCurrencyCode === "USD" ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" : null,
        ratePurpose: sourceCurrencyCode === "USD" ? "retail_price_usd_to_mdl" as const : null,
        rateSourceType: sourceCurrencyCode === "USD" ? "one_c_automatic" as const : null,
        rateEffectiveAt: sourceCurrencyCode === "USD" ? "2026-09-20T00:00:00.000Z" : null,
        ratePublishedAt: sourceCurrencyCode === "USD" ? "2026-09-20T10:00:00.000Z" : null,
        resultingAmount: converted,
        resultingCurrencyCode: "MDL" as const,
      },
    },
    stock: { exactAvailableQuantity: 5, expectedArrival: null, lastUpdatedAt: now },
  };
}
function withPriceUpdatedAt(view: ReturnType<typeof commercial>, lastUpdatedAt: string) {
  return {
    ...view,
    partnerPrice: { ...view.partnerPrice, lastUpdatedAt },
    partnerCheckoutPriceMdl: { ...view.partnerCheckoutPriceMdl, lastUpdatedAt },
    partnerPriceMdl: { ...view.partnerPriceMdl, lastUpdatedAt },
  };
}
function order(overrides: Partial<PartnerOrder> = {}): PartnerOrder {
  return { id: "order-1", companyId: "company-1", submittedBy: "user-1", cartId: "cart-1", submissionKey: SUBMISSION_KEY, submissionAttemptId: "99999999-9999-4999-8999-999999999999", status: PartnerOrderStatus.Processing, integrationStatus: PartnerOrderIntegrationStatus.Processing, oneCOrderStatus: null, requestedDeliveryDate: "2099-01-10", external1cRef: null, external1cNumber: null, external1cDate: null, payloadSnapshot: salesOrderSnapshot(), safeErrorCode: null, safeErrorMessage: null, documentTotal: null, currencyCode: null, contractNumber: null, confirmedAt: null, lastReconciledAt: null, submittedAt: null, createdAt: "2026-01-01", updatedAt: "2026-01-01", ...overrides };
}

function exportResult() { return { orderReference: ref("77777777-7777-4777-8777-777777777777"), orderNumber: "NSUU-TEST", documentDate: "2026-07-13T20:17:30.000Z", status: "unposted", exportedAt: "2026-07-13T20:17:31.000Z", requestedDeliveryDate: "2099-01-10", documentTotal: 25, itemCount: 1, totalUnits: 2 }; }
function orderItem() { return { id: "order-item-1", orderId: "order-1", productId: "product-1", externalProductRef: "66666666-6666-4666-8666-666666666666", productName: "Camera", sku: "SKU-1", quantity: 2, partnerUnitPrice: 219, currencyCode: "MDL", lineTotal: 438, sourceUnitPrice: 12.5, sourceCurrencyCode: "USD", appliedExchangeRate: 17.5, exchangeRateId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", exchangeRatePurpose: "retail_price_usd_to_mdl", exchangeRateEffectiveAt: "2026-09-20T00:00:00.000Z", exchangeRatePublishedAt: "2026-09-20T10:00:00.000Z", availableStock: 5, nearestArrivalDate: null, nearestArrivalQuantity: null, snapshotAt: "2026-01-01" }; }
function salesOrderSnapshot() { return { portalOrderReference: SUBMISSION_KEY, items: [{}] }; }
