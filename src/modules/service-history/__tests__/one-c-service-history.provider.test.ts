import { describe, expect, it, vi } from "vitest";

import { OneCServiceHistoryProvider, normalizeOneCServiceStatus, oneCServiceHistoryEntities } from "../one-c-service-history.provider";

const DOCUMENT = "11111111-1111-1111-1111-111111111111";
const COMPANY = "22222222-2222-2222-2222-222222222222";
const PRODUCT = "33333333-3333-3333-3333-333333333333";
const STATUS = "44444444-4444-4444-4444-444444444444";

describe("OneCServiceHistoryProvider", () => {
  it.each([
    ["Принят в ремонт", "accepted"],
    ["В работе", "repair_in_progress"],
    ["К выдаче", "ready_for_pickup"],
    ["Выдан покупателю", "issued_to_customer"],
    ["Новый этап", "unknown"],
  ] as const)("maps only the proven status %s", (source, expected) => {
    expect(normalizeOneCServiceStatus(source)).toBe(expected);
  });

  it("imports posted, unposted, and deleted state without mutating source semantics", async () => {
    const client = fakeClient([
      sourceRow(),
      sourceRow({ Ref_Key: "55555555-5555-5555-5555-555555555555", Posted: false }),
      sourceRow({ Ref_Key: "66666666-6666-6666-6666-666666666666", DeletionMark: true }),
    ]);
    const result = await new OneCServiceHistoryProvider(client as never).fetchPage({ skip: 0, top: 100, rangeStart: "2021-08-08", rangeEnd: "2026-08-08" });
    expect(result.rows.map(({ sourcePosted, sourceDeletionMark }) => ({ sourcePosted, sourceDeletionMark }))).toEqual([
      { sourcePosted: true, sourceDeletionMark: false },
      { sourcePosted: false, sourceDeletionMark: false },
      { sourcePosted: true, sourceDeletionMark: true },
    ]);
    expect(result.pageComplete).toBe(true);
  });

  it("uses one header read and one cached status-catalog read across pages", async () => {
    const client = fakeClient([sourceRow()]);
    const provider = new OneCServiceHistoryProvider(client as never);
    await provider.fetchPage({ skip: 0, top: 1, rangeStart: "2021-08-08", rangeEnd: "2026-08-08" });
    await provider.fetchPage({ skip: 1, top: 1, rangeStart: "2021-08-08", rangeEnd: "2026-08-08" });
    expect(client.getLiteralDateRange).toHaveBeenCalledTimes(2);
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.getLiteralDateRange).toHaveBeenCalledWith(oneCServiceHistoryEntities.source, expect.objectContaining({ top: 1 }), expect.anything());
  });

  it("keeps exact company and product references and does not infer identities", async () => {
    const result = await new OneCServiceHistoryProvider(fakeClient([sourceRow()]) as never).fetchPage({ skip: 0, top: 100, rangeStart: "2021-08-08", rangeEnd: "2026-08-08" });
    expect(result.rows[0]).toMatchObject({ counterpartyRef: COMPANY, productRef: PRODUCT, sourceStatus: "К выдаче", normalizedStatus: "ready_for_pickup" });
  });
});

function fakeClient(rows: Record<string, unknown>[]) {
  return {
    getLiteralDateRange: vi.fn().mockResolvedValue({ value: rows }),
    get: vi.fn().mockResolvedValue({ value: [{ Ref_Key: STATUS, Description: "К выдаче", DeletionMark: false }] }),
  };
}

function sourceRow(overrides: Record<string, unknown> = {}) {
  return {
    Ref_Key: DOCUMENT, DataVersion: "AAAA", Number: "NSUU-000105", Date: "2026-08-01T10:00:00", Posted: true, DeletionMark: false,
    Контрагент_Key: COMPANY, Договор_Key: null, Номенклатура_Key: PRODUCT, Характеристика_Key: null, Серия_Key: null,
    СостояниеРемонта_Key: STATUS, СервисЦентр_Key: null, ОписаниеНеисправности: "Не включается", ОписаниеРемонта: "internal source text",
    ДокументПродажи: null, ...overrides,
  };
}
