import { describe, expect, it } from "vitest";

import {
  normalizeMatchText,
  normalizePhone,
  parseCounterpartyRow,
} from "../counterparty-directory-normalization";
import { countSnapshot } from "../counterparty-directory-sync.service";

const ACTIVE_REF = "571ac1e0-4ccd-11ea-93e0-000c29cf9dd4";

describe("counterparty directory normalization", () => {
  it("normalizes fiscal codes, names, and phone values deterministically", () => {
    expect(normalizeMatchText("  ALERT-SS S.R.L. ")).toBe("alertsss.r.l.");
    expect(normalizeMatchText("  001 234 ")).toBe("001234");
    expect(normalizePhone("+373 (22) 12-34-56")).toBe("37322123456");
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
      sourceCounterpartyRows: 2,
      counterparties: [first!, second!],
      contracts: [],
      priceProfiles: [],
      pagesProcessed: 1,
      failedRecords: 0,
    });
    expect(counts).toMatchObject({
      sourceCounterparties: 2,
      stagedCounterparties: 2,
      active: 2,
      duplicateFiscalCodes: 1,
      withFiscalCode: 2,
    });
  });
});
