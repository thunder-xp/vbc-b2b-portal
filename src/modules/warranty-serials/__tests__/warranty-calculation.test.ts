import { describe, expect, it } from "vitest";
import { addCalendarMonthsClamped, deriveWarrantyState } from "../warranty-calculation";

describe("conservative warranty calculation", () => {
  it("adds 36 calendar months inclusively", () => {
    expect(addCalendarMonthsClamped("2026-08-15", 36)).toBe("2029-08-15");
  });

  it("clamps month-end dates", () => {
    expect(addCalendarMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addCalendarMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("never returns covered before the reversal scan is complete", () => {
    const base = { posted: true, deleted: false, companyMapped: true, productMapped: true, warrantyMonths: 36, returned: false, conflict: false, saleDate: "2026-01-01", businessDate: "2026-08-01" };
    expect(deriveWarrantyState({ ...base, reversalScanComplete: false }).state).toBe("sale_confirmed_review_required");
    expect(deriveWarrantyState({ ...base, reversalScanComplete: true }).state).toBe("covered");
  });

  it("prioritizes cancellation, return, conflict, missing evidence, and expiry", () => {
    const base = { posted: true, deleted: false, companyMapped: true, productMapped: true, warrantyMonths: 1, reversalScanComplete: true, returned: false, conflict: false, saleDate: "2026-01-01", businessDate: "2026-08-01" };
    expect(deriveWarrantyState({ ...base, posted: false }).state).toBe("cancelled");
    expect(deriveWarrantyState({ ...base, returned: true }).state).toBe("returned");
    expect(deriveWarrantyState({ ...base, conflict: true }).state).toBe("conflict");
    expect(deriveWarrantyState({ ...base, companyMapped: false }).state).toBe("source_incomplete");
    expect(deriveWarrantyState(base).state).toBe("expired");
  });
});
