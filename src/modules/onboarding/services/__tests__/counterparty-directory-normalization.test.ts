import { describe, expect, it } from "vitest";
import { normalizeFiscalCode } from "@/src/modules/company-identity/fiscal-code";

import {
  normalizeMatchText,
  normalizePhone,
  parseContractRow,
  parseCounterpartyRow,
} from "../counterparty-directory-normalization";
import { countSnapshot } from "../counterparty-directory-sync.service";
import { deduplicateByExternal1cId } from "../one-c-counterparty-directory.source";

const ACTIVE_REF = "571ac1e0-4ccd-11ea-93e0-000c29cf9dd4";

describe("counterparty directory normalization", () => {
  it("normalizes fiscal codes, names, and phone values deterministically", () => {
    expect(normalizeMatchText("  ALERT-SS S.R.L. ")).toBe("alertsssrl");
    expect(normalizeMatchText("  001 234 ")).toBe("001234");
    expect(normalizePhone("+373 (22) 12-34-56")).toBe("37322123456");
  });

  it("normalizes Moldova fiscal codes without numeric conversion", () => {
    expect(normalizeFiscalCode("1020602003976")).toBe("1020602003976");
    expect(normalizeFiscalCode(" 1020602003976 ")).toBe("1020602003976");
    expect(normalizeFiscalCode("1020\u00a06020 03976")).toBe("1020602003976");
    expect(normalizeFiscalCode("001-234")).toBe("001234");
    expect(normalizeFiscalCode("MD1020602003976")).toBeNull();
  });

  it("maps an active 1C counterparty without exposing raw payload data", () => {
    expect(parseCounterpartyRow({
      Ref_Key: ACTIVE_REF,
      Code: "0001",
      Description: "ALERT-SS SRL",
      НаименованиеПолное: null,
      ИНН: " 100360001 ",
      Покупатель: true,
      Поставщик: false,
      Недействителен: false,
      DeletionMark: false,
      IsFolder: false,
    })).toMatchObject({
      external1cId: ACTIVE_REF,
      name: "ALERT-SS SRL",
      normalizedFiscalCode: "100360001",
      isActive: true,
      isDeleted: false,
    });
  });

  it("maps the production MULTI-SECURITY fiscal identity from ИНН", () => {
    expect(parseCounterpartyRow({
      Ref_Key: "9a5c59b8-0293-11f1-d58d-7239d3b7bd5c",
      Code: "MULTI",
      Description: "MULTI-SECURITY",
      ИНН: "1020\u00a06020 03976",
      Покупатель: true,
      Недействителен: false,
      DeletionMark: false,
      IsFolder: false,
    })).toMatchObject({
      name: "MULTI-SECURITY",
      fiscalCode: "1020\u00a06020 03976",
      normalizedFiscalCode: "1020602003976",
      isActive: true,
    });
  });

  it("rejects folders, malformed references, and empty names", () => {
    expect(parseCounterpartyRow({ Ref_Key: ACTIVE_REF, Description: "Folder", IsFolder: true })).toBeNull();
    expect(parseCounterpartyRow({ Ref_Key: "bad", Description: "Company" })).toBeNull();
    expect(parseCounterpartyRow({ Ref_Key: ACTIVE_REF, Description: " " })).toBeNull();
  });

  it("classifies inactive and deleted rows independently", () => {
    expect(parseCounterpartyRow({
      Ref_Key: ACTIVE_REF,
      Description: "Inactive",
      Недействителен: true,
      DeletionMark: false,
    })).toMatchObject({ isActive: false, isDeleted: false });
    expect(parseCounterpartyRow({
      Ref_Key: ACTIVE_REF,
      Description: "Deleted",
      Недействителен: false,
      DeletionMark: true,
    })).toMatchObject({ isActive: false, isDeleted: true });
  });

  it("preserves governed contract facts needed for local admin validation", () => {
    expect(parseContractRow({
      Ref_Key: "e5baa428-8919-11ee-129a-7239d3b7bd5c",
      Code: "UU-002163",
      Description: "NS-155/2211/23",
      Owner: ACTIVE_REF,
      Owner_Type: "StandardODATA.Catalog_Контрагенты",
      НомерДоговора: "NS-155/2211/23",
      ДатаДоговора: "2023-11-22T00:00:00",
      ВидДоговора: "СПокупателем",
      ВидЦенКонтрагента_Key: "23cb93ec-3eb5-11f0-8d8a-7239d3b7bd5c",
      Организация_Key: "4643d461-aa49-4b70-9486-a59f80ee6af8",
      ВалютаРасчетов_Key: "cf53f667-77a3-4c69-8146-2fd58525bbfc",
      ДоговорПодписан: true,
      Недействителен: false,
      DeletionMark: false,
    })).toMatchObject({
      external1cId: "e5baa428-8919-11ee-129a-7239d3b7bd5c",
      counterpartyExternal1cId: ACTIVE_REF,
      contractType: "СПокупателем",
      organizationExternal1cId: "4643d461-aa49-4b70-9486-a59f80ee6af8",
      signed: true,
      isActive: true,
      isDefault: false,
    });
  });

  it("counts duplicate fiscal codes and directory health without mutating rows", () => {
    const first = parseCounterpartyRow({
      Ref_Key: ACTIVE_REF,
      Description: "A",
      ИНН: "001",
    });
    const second = parseCounterpartyRow({
      Ref_Key: "671ac1e0-4ccd-11ea-93e0-000c29cf9dd4",
      Description: "B",
      ИНН: "001",
    });
    const counts = countSnapshot({
      complete: true,
      fetchedCounterpartyRows: 2,
      sourceCounterpartyRows: 2,
      counterparties: [first!, second!],
      contracts: [],
      priceProfiles: [],
      deliveryCarriers: [],
      pagesProcessed: 1,
      failedRecords: 0,
      skippedCounterpartyRows: 0,
      duplicateCounterpartyRows: 0,
    });
    expect(counts).toMatchObject({
      sourceCounterparties: 2,
      stagedCounterparties: 2,
      active: 2,
      duplicateFiscalCodes: 1,
      withFiscalCode: 2,
      fetchedCounterparties: 2,
      skippedCounterparties: 0,
    });
  });

  it("deduplicates overlapping 1C pages by authoritative reference", () => {
    const rows = [
      { external1cId: ACTIVE_REF, name: "first" },
      { external1cId: ACTIVE_REF.toUpperCase(), name: "overlap" },
      {
        external1cId: "671ac1e0-4ccd-11ea-93e0-000c29cf9dd4",
        name: "second",
      },
    ];

    expect(deduplicateByExternal1cId(rows)).toEqual([rows[0], rows[2]]);
  });
});
