import { describe, expect, it } from "vitest";

import { selectLatestUsdReceipt } from "../../../../scripts/sync-commercial-exchange-rate";

const USD_REF = "00b49bb3-63d6-11e8-80d2-000c29a58b59";

describe("commercial exchange-rate CLI selection", () => {
  it("selects the 2026 receipt over the 2018 receipt and accepts string multiplicity", () => {
    const selected = selectLatestUsdReceipt([
      receipt({
        Date: "2018-07-17T10:00:00",
        Number: "OLD",
        Курс: 16.8,
        Кратность: 1,
      }),
      receipt({
        Date: "2026-06-26T10:00:00",
        Number: "NSUU-000405",
        Курс: 17.7462,
        Кратность: "1",
      }),
    ], new Date("2026-07-13T12:00:00Z").getTime());

    expect(selected).toMatchObject({
      date: "2026-06-26T10:00:00",
      number: "NSUU-000405",
      usdRate: 17.7462,
    });
    expect(selected.usdRate * 0.9897).toBeCloseTo(17.56341414, 8);
  });
});

function receipt(overrides: Record<string, unknown>) {
  return {
    Posted: true,
    DeletionMark: false,
    ВалютаДокумента_Key: USD_REF,
    ...overrides,
  };
}
