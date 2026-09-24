import type { OneCCommercialOrderCandidate } from "./types";

const GUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const CUSTOMER_ORDER_TYPE = "StandardODATA.Document_ЗаказПокупателя";

export type AgentRealizationEvidence = {
  type: "DELIVERY" | "WORK_ACT";
  ref: string;
  number: string;
  date: string;
  amount: number;
};

export type AgentPaymentEvidence = {
  type: "BANK" | "CASH";
  ref: string;
  number: string;
  date: string;
  allocatedAmount: number;
};

export type TaggedOneCRow = {
  kind: AgentRealizationEvidence["type"] | AgentPaymentEvidence["type"];
  row: Record<string, unknown>;
};

export function buildAgentEvidenceProjection(input: {
  order: OneCCommercialOrderCandidate;
  realizationRows: TaggedOneCRow[];
  paymentRows: TaggedOneCRow[];
  registerRemaining: number | null;
  sourceTruncated?: boolean;
  observedAt?: string;
}): Record<string, unknown> {
  const { order } = input;
  const realization = realizationEvidence(input.realizationRows, order);
  const payment = paymentEvidence(input.paymentRows, order);
  const orderLineGross = moneySum(order.lines.map((line) => line.gross));
  const realizedGross = moneySum(realization.items.map((item) => item.amount));
  const realizationComplete = realization.items.length > 0 && order.lines.length > 0
    && moneyEqual(realizedGross, order.grossAmount) && moneyEqual(orderLineGross, order.grossAmount);
  const computedRemaining = roundMoney(Math.max(0, order.grossAmount - payment.paid));
  const balanceContradiction = input.registerRemaining !== null
    && !moneyEqual(Math.max(0, input.registerRemaining), computedRemaining);
  const reconciliationRequired = Boolean(input.sourceTruncated) || realization.contradiction
    || payment.contradiction || (realization.items.length > 0 && !realizationComplete)
    || payment.paid > order.grossAmount + 0.01 || balanceContradiction;
  const fullyPaid = !reconciliationRequired && payment.items.length > 0
    && computedRemaining <= 0.01 && payment.paid + 0.01 >= order.grossAmount;
  const realized = realizationComplete && order.posted && !order.deletionMarked;

  return {
    order: {
      ref: order.reference,
      customerRef: order.customerRef,
      state: order.state,
      posted: order.posted,
      deletionMarked: order.deletionMarked,
    },
    realization: {
      refs: realization.items.map((item) => item.ref),
      evidence: realization.items,
      realizedAt: realized ? latestDate(realization.items.map((item) => item.date)) : null,
      gross: realized ? order.grossAmount.toFixed(2) : "0.00",
      vat: realized ? moneySum(order.lines.map((line) => line.vat)).toFixed(2) : "0.00",
      net: realized ? moneySum(order.lines.map((line) => line.net)).toFixed(2) : "0.00",
    },
    payment: {
      evidence: payment.items,
      paidGross: payment.paid.toFixed(2),
      remainingGross: computedRemaining.toFixed(2),
      registerRemainingGross: input.registerRemaining === null ? null : Math.max(0, input.registerRemaining).toFixed(2),
      fullyPaidAt: fullyPaid ? latestDate(payment.items.map((item) => item.date)) : null,
      reconciliationRequired,
    },
    lines: order.lines.map((line) => ({
      ...line,
      realizationRef: realization.items[0]?.ref ?? null,
      gross: line.gross.toFixed(2),
      vat: line.vat.toFixed(2),
      net: line.net.toFixed(2),
    })),
    sourceVersion: [order.sourceVersion, ...realization.versions, ...payment.versions].filter(Boolean).join(":"),
    observedAt: input.observedAt ?? new Date().toISOString(),
  };
}

function realizationEvidence(rows: TaggedOneCRow[], order: OneCCommercialOrderCandidate) {
  const items = new Map<string, AgentRealizationEvidence>();
  const versions: string[] = [];
  let contradiction = false;
  for (const { kind, row } of rows) {
    if (kind !== "DELIVERY" && kind !== "WORK_ACT") continue;
    const ref = guid(row.Ref_Key);
    const linked = kind === "WORK_ACT"
      ? guid(row["ЗаказПокупателя_Key"]) === order.reference
      : exactTypedOrder(row["Заказ"], row["Заказ_Type"], order.reference)
        || exactTypedOrder(row["ДокументОснование"], row["ДокументОснование_Type"], order.reference);
    if (!ref || !linked || row.Posted !== true || row.DeletionMark !== false) continue;
    if (guid(row["Контрагент_Key"]) !== order.customerRef || guid(row["Организация_Key"]) !== order.organizationRef) {
      contradiction = true;
      continue;
    }
    const value = amount(row["СуммаДокумента"]);
    const date = validDate(row.Date);
    if (value === null || value <= 0 || !date) {
      contradiction = true;
      continue;
    }
    if (!items.has(ref)) {
      items.set(ref, { type: kind, ref, number: text(row.Number), date, amount: roundMoney(value) });
      versions.push(text(row.DataVersion));
    }
  }
  return { items: [...items.values()], versions, contradiction };
}

function paymentEvidence(rows: TaggedOneCRow[], order: OneCCommercialOrderCandidate) {
  const items = new Map<string, AgentPaymentEvidence>();
  const versions: string[] = [];
  let contradiction = false;
  for (const { kind, row } of rows) {
    if (kind !== "BANK" && kind !== "CASH") continue;
    const ref = guid(row.Ref_Key);
    const headerLinked = exactTypedOrder(row["ДокументОснование"], row["ДокументОснование_Type"], order.reference);
    const allocations = array(row["РасшифровкаПлатежа"]).filter((line) =>
      exactTypedOrder(line["Заказ"], line["Заказ_Type"], order.reference));
    if (!ref || (!headerLinked && allocations.length === 0) || row.Posted !== true || row.DeletionMark !== false) continue;
    if (guid(row["Контрагент_Key"]) !== order.customerRef || guid(row["Организация_Key"]) !== order.organizationRef) {
      contradiction = true;
      continue;
    }
    const documentAmount = amount(row["СуммаДокумента"]);
    const allocated = headerLinked
      ? documentAmount
      : moneySum(allocations.map((line) => amount(line["СуммаРасчетов"] ?? line["СуммаПлатежа"]) ?? 0));
    const date = validDate(row.Date);
    if (documentAmount === null || documentAmount <= 0 || allocated === null || allocated <= 0 || !date) {
      contradiction = true;
      continue;
    }
    if (!items.has(ref)) {
      items.set(ref, { type: kind, ref, number: text(row.Number), date, allocatedAmount: roundMoney(allocated) });
      versions.push(text(row.DataVersion));
    }
  }
  const list = [...items.values()];
  return { items: list, versions, contradiction, paid: moneySum(list.map((item) => item.allocatedAmount)) };
}

export function exactTypedOrder(value: unknown, type: unknown, orderReference: string): boolean {
  return guid(value) === orderReference && text(type) === CUSTOMER_ORDER_TYPE;
}

function array(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function guid(value: unknown): string | null { const valueText = text(value).toLowerCase(); return GUID.test(valueText) ? valueText : null; }
function amount(value: unknown): number | null { const parsed = typeof value === "number" ? value : Number(value); return Number.isFinite(parsed) ? parsed : null; }
function validDate(value: unknown): string | null { const parsed = new Date(text(value)); return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null; }
function roundMoney(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
function moneySum(values: number[]): number { return roundMoney(values.reduce((total, value) => total + value, 0)); }
function moneyEqual(left: number, right: number): boolean { return Math.abs(left - right) <= 0.01; }
function latestDate(values: string[]): string | null {
  const valid = values.map((value) => new Date(value)).filter((value) => Number.isFinite(value.getTime())).sort((a, b) => b.getTime() - a.getTime());
  return valid[0]?.toISOString() ?? null;
}
