import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAgentEvidenceProjection, CUSTOMER_ORDER_TYPE, type TaggedOneCRow } from "../evidence";
import type { OneCCommercialOrderCandidate } from "../types";

const ORDER = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "22222222-2222-4222-8222-222222222222";
const ORGANIZATION = "33333333-3333-4333-8333-333333333333";
const DELIVERY = "44444444-4444-4444-8444-444444444444";
const ACT = "55555555-5555-4555-8555-555555555555";
const PAYMENT = "66666666-6666-4666-8666-666666666666";

describe("Agent standard 1C evidence", () => {
  it("A: keeps a delivery-only partial realization in reconciliation", () => {
    const result = project([delivery()], []);
    expect(section(result, "realization")).toMatchObject({ refs: [DELIVERY], gross: "0.00" });
    expect(section(result, "payment").reconciliationRequired).toBe(true);
  });

  it("B: combines exact delivery and work Act into the full realization", () => {
    const result = project([delivery(), act()], []);
    expect(section(result, "realization")).toMatchObject({ gross: "8494.00", vat: "1415.67", net: "7078.33" });
    expect(evidence(result, "realization").map((item) => item.type)).toEqual(["DELIVERY", "WORK_ACT"]);
  });

  it("C: ignores an unposted work Act", () => {
    expect(evidence(project([delivery(), act({ Posted: false })], []), "realization").map((item) => item.ref)).toEqual([DELIVERY]);
  });

  it("D: ignores a deleted work Act", () => {
    expect(evidence(project([delivery(), act({ DeletionMark: true })], []), "realization").map((item) => item.ref)).toEqual([DELIVERY]);
  });

  it("E: ignores a work Act linked to another order", () => {
    expect(evidence(project([delivery(), act({ ЗаказПокупателя_Key: "77777777-7777-4777-8777-777777777777" })], []), "realization")).toHaveLength(1);
  });

  it("F: deduplicates work Acts by Ref_Key", () => {
    expect(evidence(project([delivery(), act(), act()], []), "realization")).toHaveLength(2);
  });

  it("G: accepts an exact typed cash receipt without a payment-calendar dependency", () => {
    const result = project([delivery(), act()], [payment("CASH", { ЗапланироватьОплату: false })]);
    expect(section(result, "payment")).toMatchObject({ paidGross: "8494.00", remainingGross: "0.00" });
    expect(evidence(result, "payment")[0]).toMatchObject({ type: "CASH", ref: PAYMENT });
  });

  it("H: accepts an exact typed bank receipt", () => {
    expect(evidence(project([delivery(), act()], [payment("BANK")]), "payment")[0]).toMatchObject({ type: "BANK" });
  });

  it("I: does not read the payment-calendar flag", () => {
    const withoutFlag = section(project([delivery(), act()], [payment("CASH")]), "payment");
    const falseFlag = section(project([delivery(), act()], [payment("CASH", { ЗапланироватьОплату: false })]), "payment");
    expect(falseFlag).toEqual(withoutFlag);
  });

  it("J: ignores same-customer, same-date, same-amount receipts without an exact typed order link", () => {
    const result = project([delivery(), act()], [payment("CASH", { ДокументОснование: "", ДокументОснование_Type: "StandardODATA.Undefined" })]);
    expect(section(result, "payment")).toMatchObject({ paidGross: "0.00", remainingGross: "8494.00", fullyPaidAt: null });
  });

  it("K: reports a partial exact payment", () => {
    const result = project([delivery(), act()], [payment("CASH", { СуммаДокумента: 1000 })]);
    expect(section(result, "payment")).toMatchObject({ paidGross: "1000.00", remainingGross: "7494.00", fullyPaidAt: null, reconciliationRequired: false });
  });

  it("L: treats a contradictory settlement-register balance as reconciliation", () => {
    const result = project([delivery(), act()], [payment("CASH")], 500);
    expect(section(result, "payment").reconciliationRequired).toBe(true);
  });

  it("M: makes exact realized and paid evidence fully paid even when the register omits a zero row", () => {
    const result = project([delivery(), act()], [payment("CASH")], null);
    expect(section(result, "payment")).toMatchObject({ fullyPaidAt: new Date("2026-09-23T21:28:15").toISOString(), reconciliationRequired: false });
  });

  it("fails closed for an exact-linked reversal or refund amount", () => {
    const result = project([delivery(), act()], [payment("CASH", { СуммаДокумента: -8494 })]);
    expect(section(result, "payment")).toMatchObject({ paidGross: "0.00", reconciliationRequired: true });
  });

  it("N-P: requires realized full payment for ELIGIBLE and never auto-transitions to PAID", () => {
    const sql = readFileSync("supabase/migrations/20260924065735_agent_standard_1c_evidence_coverage.sql", "utf8");
    expect(sql).toContain("(p_source #>> '{realization,gross}')::numeric = link.source_order_gross_snapshot then 'ELIGIBLE'");
    expect(sql).toContain("reward_amount := round(equipment_net * equipment_rate / 100 + installation_net * installation_rate / 100, 2)");
    expect(sql).not.toContain("then 'PAID'");
    expect(round(5828.33 * 0.04 + 1250 * 0.08)).toBe(333.13);
  });
});

function project(realizationRows: TaggedOneCRow[], paymentRows: TaggedOneCRow[], registerRemaining: number | null = null) {
  return buildAgentEvidenceProjection({ order: order(), realizationRows, paymentRows, registerRemaining, observedAt: "2026-09-24T06:00:00Z" });
}

function order(): OneCCommercialOrderCandidate {
  return {
    reference: ORDER, number: "NS-002691", date: "2026-09-20T10:00:00Z", customerRef: CUSTOMER,
    customerName: "Pilot", customerKind: "LEGAL_ENTITY", organizationRef: ORGANIZATION,
    grossAmount: 8494, currency: "MDL", state: "completed", posted: true, deletionMarked: false, sourceVersion: "order-v1",
    lines: [
      { lineRef: `${ORDER}:stock:1`, nomenclatureRef: "88888888-8888-4888-8888-888888888888", name: "Equipment", gross: 6994, vat: 1165.67, net: 5828.33 },
      { lineRef: `${ORDER}:service:1`, nomenclatureRef: "99999999-9999-4999-8999-999999999999", name: "Installation", gross: 1500, vat: 250, net: 1250 },
    ],
  };
}

function delivery(overrides: Record<string, unknown> = {}): TaggedOneCRow {
  return tagged("DELIVERY", {
    Ref_Key: DELIVERY, Number: "NSUU-000100", Date: "2026-09-23T21:10:00", Posted: true, DeletionMark: false,
    Контрагент_Key: CUSTOMER, Организация_Key: ORGANIZATION, Заказ: ORDER, Заказ_Type: CUSTOMER_ORDER_TYPE,
    ДокументОснование: "", ДокументОснование_Type: "StandardODATA.Undefined", СуммаДокумента: 6994, DataVersion: "delivery-v1", ...overrides,
  });
}

function act(overrides: Record<string, unknown> = {}): TaggedOneCRow {
  return tagged("WORK_ACT", {
    Ref_Key: ACT, Number: "NSUU-000001", Date: "2026-09-23T21:12:52", Posted: true, DeletionMark: false,
    Контрагент_Key: CUSTOMER, Организация_Key: ORGANIZATION, ЗаказПокупателя_Key: ORDER,
    СуммаДокумента: 1500, DataVersion: "act-v1", ...overrides,
  });
}

function payment(kind: "BANK" | "CASH", overrides: Record<string, unknown> = {}): TaggedOneCRow {
  return tagged(kind, {
    Ref_Key: PAYMENT, Number: "NSUU-000560", Date: "2026-09-23T21:28:15", Posted: true, DeletionMark: false,
    Контрагент_Key: CUSTOMER, Организация_Key: ORGANIZATION, ДокументОснование: ORDER,
    ДокументОснование_Type: CUSTOMER_ORDER_TYPE, СуммаДокумента: 8494,
    РасшифровкаПлатежа: [{ Заказ: "", Заказ_Type: "StandardODATA.Undefined", СуммаРасчетов: 8494 }],
    DataVersion: "payment-v1", ...overrides,
  });
}

function tagged(kind: TaggedOneCRow["kind"], row: Record<string, unknown>): TaggedOneCRow { return { kind, row }; }
function section(value: Record<string, unknown>, key: string): Record<string, unknown> { return value[key] as Record<string, unknown>; }
function evidence(value: Record<string, unknown>, key: string): Array<Record<string, unknown>> { return section(value, key).evidence as Array<Record<string, unknown>>; }
function round(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
