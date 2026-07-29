import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminRetailPriceHistoryHealthView } from "../AdminRetailPriceHistoryHealth";

describe("AdminRetailPriceHistoryHealthView", () => {
  it("shows safe discovery aggregates and the blocked currency state", () => {
    render(<AdminRetailPriceHistoryHealthView health={{
      productsWithCurrentRetail: 791,
      productsWithHistory: 791,
      productsWithBaselineOnly: 791,
      lastHistoryUpdate: "2026-07-29T10:00:00.000Z",
      failedHistoryAppendCount: 0,
      currencyDistribution: { MDL: 791 },
      verification: {
        status: "currency_verification_required",
        current_currency: "MDL",
        source_entity: "InformationRegister_ЦеныНоменклатуры",
        historical_rows_discovered: 51_868,
        distinct_products: 1_500,
        earliest_effective_at: "2018-01-01T00:00:00.000Z",
        latest_effective_at: "2026-07-29T00:00:00.000Z",
      },
      latestBackfill: null,
      openIncidentCount: 0,
    }} />);

    expect(screen.getByText("Публикация истории заблокирована")).toBeInTheDocument();
    expect(screen.getByText(
      "Не подтверждена валюта исторических записей RETAIL. Для разблокировки требуется проверяемое доказательство и защищённая операция с аудитом.",
    )).toBeInTheDocument();
    expect(screen.queryByText(
      /price_amount|source_fingerprint|sync_id/i,
    )).not.toBeInTheDocument();
  });
});
