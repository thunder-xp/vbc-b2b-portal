import { describe, expect, it, vi } from "vitest";

import { OneCODataClient } from "../one-c-odata-client";
import {
  OneCProductRelationProvider,
  parseRelationRow,
} from "../one-c-product-relation-provider";

const source = "29a5f336-3473-11ef-de8b-7239d3b7bd5c";
const target = "e21d4172-a00c-11ee-129a-7239d3b7bd5c";
const other = "800af118-be72-11ed-0899-7239d3b7bd5c";

describe("OneCProductRelationProvider", () => {
  it("maps the verified analog contract and preserves directionality and priority", () => {
    expect(parseRelationRow("analog", {
      Номенклатура_Key: source,
      Аналог_Key: target,
      Приоритет: 2,
    })).toMatchObject({
      relationType: "analog",
      sourceProductRef: source,
      targetProductRef: target,
      priority: 2,
      sourceCharacteristicRef: null,
      targetCharacteristicRef: null,
    });
  });

  it("maps related rows and normalizes zero characteristic references", () => {
    expect(parseRelationRow("related", {
      Номенклатура_Key: source,
      СопутствующийТовар_Key: other,
      Характеристика_Key: "00000000-0000-0000-0000-000000000000",
      ХарактеристикаCопутствующегоТовара_Key: "00000000-0000-0000-0000-000000000000",
      Приоритет: "1",
    })).toMatchObject({
      relationType: "related",
      sourceProductRef: source,
      targetProductRef: other,
      priority: 1,
      sourceCharacteristicRef: null,
      targetCharacteristicRef: null,
    });
  });

  it("quarantines malformed non-zero characteristic references", () => {
    expect(parseRelationRow("related", {
      Номенклатура_Key: source,
      СопутствующийТовар_Key: other,
      Характеристика_Key: "not-a-guid",
      ХарактеристикаCопутствующегоТовара_Key: "00000000-0000-0000-0000-000000000000",
    })).toMatchObject({ reason: "invalid_characteristic" });
  });

  it("quarantines malformed, zero, and self relations independently", () => {
    expect(parseRelationRow("analog", null)).toMatchObject({ reason: "invalid_shape" });
    expect(parseRelationRow("analog", { Номенклатура_Key: "bad", Аналог_Key: target }))
      .toMatchObject({ reason: "invalid_source" });
    expect(parseRelationRow("analog", { Номенклатура_Key: source, Аналог_Key: source }))
      .toMatchObject({ reason: "self_relation" });
  });

  it("paginates both registers and collapses duplicate logical pairs deterministically", async () => {
    const get = vi.fn()
      .mockResolvedValueOnce({ value: [analog(3), analog(1)] })
      .mockResolvedValueOnce({ value: [] })
      .mockResolvedValueOnce({ value: [related()] });
    const result = await new OneCProductRelationProvider(
      { get } as unknown as OneCODataClient,
      2,
      5,
    ).loadSnapshot();

    expect(result).toMatchObject({
      analogRowsReceived: 2,
      relatedRowsReceived: 1,
      duplicatesCollapsed: 1,
      pagesProcessed: 3,
    });
    expect(result.rows).toHaveLength(2);
    expect(result.rejections).toContainEqual(expect.objectContaining({ reason: "duplicate_row" }));
    expect(result.rows.find((row) => row.relationType === "analog")?.priority).toBe(1);
    expect(get).toHaveBeenCalledWith(
      "InformationRegister_АналогиНоменклатуры",
      expect.objectContaining({ "$top": "2", "$skip": "0" }),
      expect.anything(),
    );
  });
});

function analog(priority: number) {
  return { Номенклатура_Key: source, Аналог_Key: target, Приоритет: priority };
}

function related() {
  return {
    Номенклатура_Key: source,
    СопутствующийТовар_Key: other,
    Характеристика_Key: "00000000-0000-0000-0000-000000000000",
    ХарактеристикаCопутствующегоТовара_Key: "00000000-0000-0000-0000-000000000000",
    Приоритет: 0,
  };
}
