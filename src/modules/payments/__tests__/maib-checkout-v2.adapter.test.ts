import { describe, expect, it, vi } from "vitest";

import { createMaibCheckoutV2Adapter, maibConfigurationSummary } from "../providers/maib/maib-checkout-v2.adapter";
import { PaymentProviderError } from "../providers/payment-provider";

const environment = {
  MAIB_CLIENT_ID: "client-id",
  MAIB_CLIENT_SECRET: "client-secret",
  MAIB_SIGNATURE_KEY: "signature-key",
  MAIB_API_BASE_URL: "https://sandbox.maibmerchants.md",
  PUBLIC_APP_URL: "https://www.nsd.md",
};
const checkoutInput = {
  paymentAttemptId: "11111111-1111-4111-8111-111111111111",
  orderNumber: "R-100",
  orderCreatedAt: "2026-09-15T10:00:00.000Z",
  amount: "1250.50",
  currency: "MDL" as const,
  locale: "ru" as const,
};

describe("MAIB Checkout API v2 adapter", () => {
  it("maps OAuth and checkout requests from authoritative input", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ ok: true, result: { accessToken: "access-token", expiresIn: 300, tokenType: "Bearer" } }))
      .mockResolvedValueOnce(json({ ok: true, result: { checkoutId: "22222222-2222-4222-8222-222222222222", checkoutUrl: "https://checkout-sandbox.maib.md/222" } }));
    const result = await createMaibCheckoutV2Adapter(environment, fetcher).createCheckout(checkoutInput);

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[0]![0])).toBe("https://sandbox.maibmerchants.md/v2/auth/token");
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual({ clientId: "client-id", clientSecret: "client-secret" });
    expect(String(fetcher.mock.calls[1]![0])).toBe("https://sandbox.maibmerchants.md/v2/checkouts");
    const checkout = JSON.parse(String(fetcher.mock.calls[1]![1]?.body));
    expect(checkout).toMatchObject({
      amount: 1250.5,
      currency: "MDL",
      language: "ru",
      orderInfo: { id: checkoutInput.paymentAttemptId, orderAmount: 1250.5, orderCurrency: "MDL" },
      callbackUrl: "https://www.nsd.md/api/payments/maib/callback",
      successUrl: `https://www.nsd.md/payment/return?provider=maib&paymentAttemptId=${checkoutInput.paymentAttemptId}`,
      failUrl: `https://www.nsd.md/payment/return?provider=maib&paymentAttemptId=${checkoutInput.paymentAttemptId}`,
    });
    expect(JSON.stringify(checkout)).not.toContain("client-secret");
    expect(JSON.stringify(checkout)).not.toContain("signature-key");
    expect(result).toMatchObject({ checkoutId: "22222222-2222-4222-8222-222222222222", checkoutUrl: "https://checkout-sandbox.maib.md/222", providerStatus: "WaitingForInit", httpCalls: 2 });
  });

  it("normalizes auth failures without exposing a raw body", async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ ok: false, errors: [{ errorCode: "invalid_client", errorMessage: "secret details" }] }, 401));
    await expect(createMaibCheckoutV2Adapter(environment, fetcher).createCheckout(checkoutInput)).rejects.toMatchObject({ stage: "auth", safeCode: "INVALID_CLIENT", ambiguous: false, httpStatus: 401 });
  });

  it("retrieves bounded authoritative checkout payment evidence for reconciliation", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ ok: true, result: { accessToken: "access-token", expiresIn: 300, tokenType: "Bearer" } }))
      .mockResolvedValueOnce(json({ ok: true, result: {
        id: "22222222-2222-4222-8222-222222222222", status: "Completed", amount: 1250.5, currency: "MDL",
        order: { id: checkoutInput.paymentAttemptId },
        payment: { paymentId: "33333333-3333-4333-8333-333333333333", amount: 1250.5, currency: "MDL", status: "Executed", executedAt: "2026-09-16T12:00:00.000Z", referenceNumber: "SAFE-RRN" },
      } }));
    const result = await createMaibCheckoutV2Adapter(environment, fetcher).getCheckoutEvidence("22222222-2222-4222-8222-222222222222");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]![0])).toBe("https://sandbox.maibmerchants.md/v2/checkouts/22222222-2222-4222-8222-222222222222");
    expect(result).toEqual({
      checkoutId: "22222222-2222-4222-8222-222222222222", paymentId: "33333333-3333-4333-8333-333333333333",
      orderReference: checkoutInput.paymentAttemptId, checkoutAmount: "1250.50", checkoutCurrency: "MDL",
      paymentAmount: "1250.50", paymentCurrency: "MDL", paymentStatus: "Executed",
      providerEventAt: "2026-09-16T12:00:00.000Z", rrn: "SAFE-RRN",
    });
  });

  it("treats an ambiguous checkout response as non-retryable by the caller", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ ok: true, result: { accessToken: "token", expiresIn: 300, tokenType: "Bearer" } }))
      .mockResolvedValueOnce(json({ ok: true, result: { checkoutId: "bad", checkoutUrl: "https://evil.example/pay" } }));
    await expect(createMaibCheckoutV2Adapter(environment, fetcher).createCheckout(checkoutInput)).rejects.toMatchObject({ stage: "checkout", safeCode: "INVALID_CHECKOUT_RESPONSE", ambiguous: true });
  });

  it("requires complete server-only sandbox configuration", () => {
    expect(maibConfigurationSummary(environment)).toEqual({ ready: true, sandbox: true, missing: [] });
    expect(maibConfigurationSummary({ ...environment, MAIB_CLIENT_SECRET: undefined }).ready).toBe(false);
    expect(() => createMaibCheckoutV2Adapter({ ...environment, MAIB_API_BASE_URL: "https://api.maibmerchants.md" })).toThrow(PaymentProviderError);
  });
});

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
