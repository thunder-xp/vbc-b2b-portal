import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const script = readFileSync(
  resolve(process.cwd(), "scripts/sync-commercial-exchange-rate.ts"),
  "utf8",
);

describe("commercial exchange-rate CLI", () => {
  it("uses the shared authenticated commercial-rates sync engine", () => {
    expect(script).toContain("getOneCCommercialRatesEnv");
    expect(script).toContain("createExchangeRateSyncService");
    expect(script).not.toContain("Document_ПриходнаяНакладная");
    expect(script).not.toContain("selectLatestUsdReceipt");
    expect(script).not.toContain("ONEC_PASSWORD");
  });

  it("logs only bounded outcome metadata", () => {
    expect(script).toContain("outcome: result.outcome");
    expect(script).toContain("publishedCount: result.publishedCount");
    expect(script).toContain("checkedAt: result.checkedAt");
    expect(script).not.toContain("JSON.stringify(error)");
  });
});
