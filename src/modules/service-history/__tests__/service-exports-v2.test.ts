// @vitest-environment node

import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { renderServiceStatementPdf, renderServiceStatementXlsx } from "../exports";
import type { ServiceMonthExport } from "../types";

describe("service statement exports", () => {
  it("produces a valid XLSX containing factual rows and totals", () => {
    const archive = unzipSync(renderServiceStatementXlsx(statement(), "ru"));
    expect(Object.keys(archive)).toContain("xl/worksheets/sheet1.xml");
    const sheet = strFromU8(archive["xl/worksheets/sheet1.xml"]!);
    expect(sheet).toContain("Сводка сервисных услуг");
    expect(sheet).toContain("NSUU-000283");
    expect(sheet).toContain("Замена кабеля");
    expect(sheet).toContain(">990.00<");
    expect(sheet).not.toMatch(/[=+@]WEBSERVICE/i);
  });

  it("produces a real compact PDF statement", async () => {
    const bytes = await renderServiceStatementPdf(statement(), "ro");
    expect(Buffer.from(bytes).subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});

function statement(): ServiceMonthExport {
  return {
    companyName: "ALERT-SS SRL", month: "2026-09", rowCount: 1, truncated: false,
    rows: [{ id: "11111111-1111-1111-1111-111111111111", documentNumber: "NSUU-000283", completionDate: "2026-09-10T12:00:00Z", productId: null, productSku: "400499", productName: "DH-IPC-HFW1430S1-A-S5", maskedSerial: "9M0***B9A", workDescription: "Замена кабеля", status: "issued_to_customer", contract: "Сервис-центр", serviceAmount: "990.00", vatAmount: "0.00", currency: "MDL" }],
    totals: [{ currency: "MDL", completedServiceCount: 1, totalServiceAmount: "990.00", totalVatAmount: "0.00" }],
  };
}
