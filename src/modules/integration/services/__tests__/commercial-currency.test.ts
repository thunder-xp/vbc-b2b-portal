import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  validateCommercialCurrencyContext,
  validatePriceCurrencyAlignment,
} from "../commercial-currency";

describe("commercial currency semantics", () => {
  it.each([
    {
      name: "MDL settlement with authoritative USD pricing",
      settlementCurrencyRef: "mdl-ref",
      authoritativePriceCurrencyRef: "usd-ref",
      publishedPriceCurrencyRef: "usd-ref",
    },
    {
      name: "USD settlement with authoritative USD pricing",
      settlementCurrencyRef: "usd-ref",
      authoritativePriceCurrencyRef: "usd-ref",
      publishedPriceCurrencyRef: "usd-ref",
    },
    {
      name: "EUR settlement with authoritative USD pricing",
      settlementCurrencyRef: "eur-ref",
      authoritativePriceCurrencyRef: "usd-ref",
      publishedPriceCurrencyRef: "usd-ref",
    },
    {
      name: "normalized authoritative and published references",
      settlementCurrencyRef: "mdl-ref",
      authoritativePriceCurrencyRef: " USD-REF ",
      publishedPriceCurrencyRef: "usd-ref",
    },
  ])("accepts $name", (currencies) => {
    expect(validateCommercialCurrencyContext({
      ...currencies,
      settlementCurrencyCode: null,
      authoritativePriceCurrencyCode: null,
      publishedPriceCurrencyCode: null,
    })).toEqual({ valid: true, code: "COMMERCIAL_CURRENCY_VALID" });
  });

  it.each([
    {
      name: "missing settlement currency",
      settlementCurrencyRef: null,
      authoritativePriceCurrencyRef: "usd-ref",
      publishedPriceCurrencyRef: "usd-ref",
      code: "SETTLEMENT_CURRENCY_MISSING",
    },
    {
      name: "missing authoritative price currency",
      settlementCurrencyRef: "mdl-ref",
      authoritativePriceCurrencyRef: null,
      publishedPriceCurrencyRef: "usd-ref",
      code: "AUTHORITATIVE_PRICE_CURRENCY_MISSING",
    },
    {
      name: "missing published price currency",
      settlementCurrencyRef: "mdl-ref",
      authoritativePriceCurrencyRef: "usd-ref",
      publishedPriceCurrencyRef: null,
      code: "PUBLISHED_PRICE_CURRENCY_MISSING",
    },
    {
      name: "price currency mismatch",
      settlementCurrencyRef: "mdl-ref",
      authoritativePriceCurrencyRef: "usd-ref",
      publishedPriceCurrencyRef: "mdl-ref",
      code: "PRICE_CURRENCY_MISMATCH",
    },
  ])("rejects $name", ({ code, ...currencies }) => {
    expect(validateCommercialCurrencyContext({
      ...currencies,
      settlementCurrencyCode: null,
      authoritativePriceCurrencyCode: null,
      publishedPriceCurrencyCode: null,
    })).toEqual({ valid: false, code });
  });

  it("does not use settlement currency when aligning price currencies", () => {
    expect(validatePriceCurrencyAlignment({
      authoritativePriceCurrencyRef: "usd-ref",
      publishedPriceCurrencyRef: "usd-ref",
    })).toEqual({ valid: true, code: "COMMERCIAL_CURRENCY_VALID" });
  });
});

describe("commercial currency architecture guard", () => {
  it("does not compare settlement currency with a price currency", () => {
    const files = [
      "src/modules/integration/services/commercial-currency.ts",
      "src/modules/orders/services/checkout-configuration.service.ts",
      "src/modules/orders/services/order.service.ts",
      "supabase/migrations/20260826200949_enforce_commercial_currency_semantics.sql",
    ];
    const source = files
      .map((file) => readFileSync(resolve(process.cwd(), file), "utf8"))
      .join("\n")
      .replace(/\r\n/g, "\n");

    expect(source).not.toMatch(
      /settlementCurrencyRef\s*[!=]==?\s*(?:authoritativePriceCurrencyRef|publishedPriceCurrencyRef)/,
    );
    expect(source).not.toMatch(
      /(?:authoritativePriceCurrencyRef|publishedPriceCurrencyRef)\s*[!=]==?\s*settlementCurrencyRef/,
    );
    expect(source).not.toMatch(
      /contract_currency_external_1c_id\s*(?:<>|=)\s*(?:source_price_type\.currency_external_1c_id|local_price_type\.currency_ref|resolved_currency_ref)/i,
    );
  });
});
