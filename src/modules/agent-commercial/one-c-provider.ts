import "server-only";

import { getOneCEnv } from "@/src/lib/env";
import { OneCProvider } from "@/src/modules/integration/providers/one-c/one-c-provider";
import { OneCODataClient } from "@/src/modules/integration/providers/one-c/one-c-odata-client";
import { normalizeOneCCurrencyCode } from "@/src/modules/integration/providers/one-c/one-c-currency";
import { buildAgentEvidenceProjection, exactTypedOrder, type TaggedOneCRow } from "./evidence";
import type { OneCAgentCandidate, OneCCommercialOrderCandidate, OneCCommercialOrderLine } from "./types";

const GUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const ORDER_RESOURCE = "Document_ЗаказПокупателя";
const DELIVERY_RESOURCE = "Document_РасходнаяНакладная";
const WORK_ACT_RESOURCE = "Document_АктВыполненныхРабот";
const BANK_PAYMENT_RESOURCE = "Document_ПоступлениеНаСчет";
const CASH_PAYMENT_RESOURCE = "Document_ПоступлениеВКассу";
const SETTLEMENT_REGISTER = "AccumulationRegister_РасчетыСПокупателями";
const COUNTERPARTY_RESOURCE = "Catalog_Контрагенты";
const CURRENCY_RESOURCE = "Catalog_Валюты";
const NOMENCLATURE_RESOURCE = "Catalog_Номенклатура";
const EVIDENCE_PAGE_SIZE = 100;
const EVIDENCE_MAX_PAGES = 5;
const ORDER_SELECT = [
  "Ref_Key", "Number", "Date", "Posted", "DeletionMark", "Контрагент_Key",
  "Организация_Key", "СуммаДокумента", "ВалютаДокумента_Key", "СостояниеЗаказа",
  "СостояниеЗаказа_Type", "DataVersion",
].join(",");

export class OneCAgentCommercialProvider {
  private readonly client: OneCODataClient;
  private readonly provider: OneCProvider;

  constructor() {
    const config = getOneCEnv();
    this.client = new OneCODataClient(config);
    this.provider = new OneCProvider(config);
  }

  async resolveAgent(reference: string): Promise<OneCAgentCandidate> {
    requireGuid(reference, "1C counterparty");
    const page = await this.provider.partners.searchPartners({ query: reference, limit: 2 });
    const exact = page.items.find((item) => item.reference.externalId.toLowerCase() === reference.toLowerCase());
    if (!exact) throw new Error("ONEC_AGENT_NOT_FOUND");
    return { reference: exact.reference.externalId.toLowerCase(), code: exact.code, fiscalCode: exact.taxId, name: exact.displayName };
  }

  async searchOrders(number: string): Promise<OneCCommercialOrderCandidate[]> {
    const normalized = number.trim();
    if (!/^[\p{L}\p{N}._/-]{1,80}$/u.test(normalized)) throw new Error("INVALID_ONEC_ORDER_NUMBER");
    if (GUID.test(normalized)) return [await this.readOrder(normalized.toLowerCase())];
    const payload = await this.client.getFilteredCollection(ORDER_RESOURCE, {
      select: ORDER_SELECT,
      filter: `Number eq '${normalized.replaceAll("'", "''")}'`,
      top: 20,
    }, { requestKind: "agent_commercial_order_search" });
    const rows = collection(payload);
    const customerRefs = [...new Set(rows.map((row) => guid(row["Контрагент_Key"])).filter(isString))];
    const currencyRefs = [...new Set(rows.map((row) => guid(row["ВалютаДокумента_Key"])).filter(isString))];
    const [customerPayload, currencyPayload] = await Promise.all([
      this.client.getLiteralGuidBatch(COUNTERPARTY_RESOURCE, { refs: customerRefs, select: "Ref_Key,Description,ВидКонтрагента" }, { requestKind: "agent_commercial_customer_batch" }),
      this.client.getLiteralGuidBatch(CURRENCY_RESOURCE, { refs: currencyRefs, select: "Ref_Key,Code,Description" }, { requestKind: "agent_commercial_currency_batch" }),
    ]);
    const lookups = {
      customers: recordsByRef(customerPayload),
      currencies: recordsByRef(currencyPayload),
    };
    return Promise.all(rows.map((row) => this.mapOrder(row, lookups)));
  }

  async getOrder(reference: string): Promise<OneCCommercialOrderCandidate> {
    return this.readOrder(requireGuid(reference, "1C order"));
  }

  async projectionSource(orderReference: string): Promise<Record<string, unknown>> {
    requireGuid(orderReference, "1C order");
    const order = await this.readOrder(orderReference);
    const deliverySelect = "Ref_Key,Number,Date,Posted,DeletionMark,Контрагент_Key,Организация_Key,Заказ,Заказ_Type,ДокументОснование,ДокументОснование_Type,СуммаДокумента,DataVersion";
    const actSelect = "Ref_Key,Number,Date,Posted,DeletionMark,Контрагент_Key,Организация_Key,ЗаказПокупателя_Key,СуммаДокумента,DataVersion";
    const paymentSelect = "Ref_Key,Number,Date,Posted,DeletionMark,Контрагент_Key,Организация_Key,ВидОперации,ДокументОснование,ДокументОснование_Type,СуммаДокумента,РасшифровкаПлатежа,DataVersion";
    const sourceFilter = `Контрагент_Key eq guid'${order.customerRef}' and Организация_Key eq guid'${order.organizationRef}' and Date ge datetime'${order.date.slice(0, 10)}T00:00:00'`;
    const balanceCondition = `Организация_Key eq guid'${order.organizationRef}' and Контрагент_Key eq guid'${order.customerRef}'`;

    const [deliveryOrder, deliveryBase, deliveryScan, workActs, bankDirect, cashDirect, bank, cash, balancePayload] = await Promise.all([
      this.readEvidencePages(DELIVERY_RESOURCE, deliverySelect, `Заказ eq '${order.reference}'`, "agent_commercial_delivery_order_evidence"),
      this.readEvidencePages(DELIVERY_RESOURCE, deliverySelect, `ДокументОснование eq '${order.reference}'`, "agent_commercial_delivery_base_evidence"),
      this.readEvidencePages(DELIVERY_RESOURCE, deliverySelect, sourceFilter, "agent_commercial_delivery_bounded_scan"),
      this.readEvidencePages(WORK_ACT_RESOURCE, actSelect, `ЗаказПокупателя_Key eq guid'${order.reference}'`, "agent_commercial_work_act_evidence"),
      this.readEvidencePages(BANK_PAYMENT_RESOURCE, paymentSelect, `ДокументОснование eq '${order.reference}'`, "agent_commercial_bank_payment_direct_evidence"),
      this.readEvidencePages(CASH_PAYMENT_RESOURCE, paymentSelect, `ДокументОснование eq '${order.reference}'`, "agent_commercial_cash_payment_direct_evidence"),
      this.readEvidencePages(BANK_PAYMENT_RESOURCE, paymentSelect, sourceFilter, "agent_commercial_bank_payment_evidence"),
      this.readEvidencePages(CASH_PAYMENT_RESOURCE, paymentSelect, sourceFilter, "agent_commercial_cash_payment_evidence"),
      this.client.get(`${SETTLEMENT_REGISTER}/Balance(Condition='${balanceCondition.replaceAll("'", "''")}',Dimensions='Договор,Заказ')`, {}, { requestKind: "agent_commercial_order_balance_corroboration" }),
    ]);

    const realizationRows: TaggedOneCRow[] = [
      ...deliveryOrder.rows.map((row) => ({ kind: "DELIVERY" as const, row })),
      ...deliveryBase.rows.map((row) => ({ kind: "DELIVERY" as const, row })),
      ...deliveryScan.rows.map((row) => ({ kind: "DELIVERY" as const, row })),
      ...workActs.rows.map((row) => ({ kind: "WORK_ACT" as const, row })),
    ];
    const paymentRows: TaggedOneCRow[] = [
      ...bankDirect.rows.map((row) => ({ kind: "BANK" as const, row })),
      ...cashDirect.rows.map((row) => ({ kind: "CASH" as const, row })),
      ...bank.rows.map((row) => ({ kind: "BANK" as const, row })),
      ...cash.rows.map((row) => ({ kind: "CASH" as const, row })),
    ];
    const registerRemaining = settlementBalance(collection(balancePayload), order.reference);
    const projection = buildAgentEvidenceProjection({
      order,
      realizationRows,
      paymentRows,
      registerRemaining,
      sourceTruncated: deliveryOrder.truncated || deliveryBase.truncated || deliveryScan.truncated || workActs.truncated
        || bankDirect.truncated || cashDirect.truncated || bank.truncated || cash.truncated,
    });
    const paymentProjection = record(record(projection).payment);
    if (paymentProjection.reconciliationRequired === true) {
      console.warn("[agent-commercial] evidence reconciliation required", {
        orderRef: order.reference,
        realizationRefs: collectionFromProjection(projection, "realization", "evidence").map((row) => row.ref),
        paymentRefs: collectionFromProjection(projection, "payment", "evidence").map((row) => row.ref),
        registerRemaining,
      });
    }
    return projection;
  }

  private async readEvidencePages(resource: string, select: string, filter: string, requestKind: string) {
    const rows: Record<string, unknown>[] = [];
    for (let page = 0; page < EVIDENCE_MAX_PAGES; page += 1) {
      const current = collection(await this.client.getFilteredCollection(resource, {
        select, filter, top: EVIDENCE_PAGE_SIZE, skip: page * EVIDENCE_PAGE_SIZE,
      }, { requestKind }));
      rows.push(...current);
      if (current.length < EVIDENCE_PAGE_SIZE) return { rows, truncated: false };
    }
    return { rows, truncated: true };
  }

  private async readOrder(reference: string): Promise<OneCCommercialOrderCandidate> {
    const payload = await this.client.get(`${ORDER_RESOURCE}(guid'${reference}')`, {
      $select: `${ORDER_SELECT},Запасы`,
    }, { requestKind: "agent_commercial_order_exact" });
    return this.mapOrder(record(payload));
  }

  private async mapOrder(row: Record<string, unknown>, lookups?: {
    customers: Map<string, Record<string, unknown>>;
    currencies: Map<string, Record<string, unknown>>;
  }): Promise<OneCCommercialOrderCandidate> {
    const reference = requireGuidValue(row.Ref_Key, "order");
    const customerRef = requireGuidValue(row["Контрагент_Key"], "customer");
    const organizationRef = requireGuidValue(row["Организация_Key"], "organization");
    const currencyRef = requireGuidValue(row["ВалютаДокумента_Key"], "currency");
    const [customer, currency] = lookups
      ? [lookups.customers.get(customerRef), lookups.currencies.get(currencyRef)]
      : await Promise.all([
        this.client.get(`${COUNTERPARTY_RESOURCE}(guid'${customerRef}')`, { $select: "Ref_Key,Description,ВидКонтрагента" }, { requestKind: "agent_commercial_customer" }),
        this.client.get(`${CURRENCY_RESOURCE}(guid'${currencyRef}')`, { $select: "Ref_Key,Code,Description" }, { requestKind: "agent_commercial_currency" }),
      ]);
    if (!customer || !currency) throw new Error("INCOMPLETE_ONEC_ORDER_REFERENCE_DATA");
    const rawLines = [
      ...array(row["Запасы"]).map((line) => ({ line, section: "stock" } as const)),
      ...array(row["Услуги"]).map((line) => ({ line, section: "service" } as const)),
    ];
    const nomenclatureRefs = [...new Set(rawLines.map(({ line }) => guid(line["Номенклатура"] ?? line["Номенклатура_Key"])).filter(isString))];
    const names = await this.nomenclatureNames(nomenclatureRefs);
    const lines = rawLines.map(({ line, section }, index) => mapLine(reference, line, section, index, names)).filter(isLine);
    return {
      reference,
      number: requiredText(row.Number, "order number"),
      date: requiredDate(row.Date),
      customerRef,
      customerName: requiredText(record(customer).Description, "customer name"),
      customerKind: customerKind(record(customer)["ВидКонтрагента"]),
      organizationRef,
      grossAmount: requiredAmount(row["СуммаДокумента"], "order total"),
      currency: currencyCode(record(currency)),
      state: text(row["СостояниеЗаказа"]) || null,
      posted: requiredBoolean(row.Posted),
      deletionMarked: requiredBoolean(row.DeletionMark),
      sourceVersion: text(row.DataVersion) || reference,
      lines,
    };
  }

  private async nomenclatureNames(references: string[]): Promise<Map<string, string>> {
    if (!references.length) return new Map();
    const payload = await this.client.getLiteralGuidBatch(NOMENCLATURE_RESOURCE, {
      refs: references,
      select: "Ref_Key,Description",
    }, { requestKind: "agent_commercial_nomenclature" });
    return new Map(collection(payload).flatMap((row) => {
      const reference = guid(row.Ref_Key); const name = text(row.Description);
      return reference && name ? [[reference, name] as const] : [];
    }));
  }
}

function mapLine(orderRef: string, row: Record<string, unknown>, section: "stock" | "service", index: number, names: Map<string, string>): OneCCommercialOrderLine | null {
  const nomenclatureRef = guid(row["Номенклатура"] ?? row["Номенклатура_Key"]);
  const gross = amount(row["Всего"] ?? row["Сумма"]);
  const vat = amount(row["СуммаНДС"]);
  if (!nomenclatureRef || gross === null || vat === null || vat < 0 || gross < vat) return null;
  const lineNumber = amount(row.LineNumber);
  return {
    lineRef: `${orderRef}:${section}:${lineNumber && Number.isInteger(lineNumber) ? lineNumber : index + 1}`,
    nomenclatureRef,
    name: names.get(nomenclatureRef) ?? nomenclatureRef,
    gross: roundMoney(gross), vat: roundMoney(vat), net: roundMoney(gross - vat),
  };
}

function collection(value: unknown): Record<string, unknown>[] { const root = record(value); return array(root.value); }
function recordsByRef(value: unknown): Map<string, Record<string, unknown>> {
  return new Map(collection(value).flatMap((row) => { const reference = guid(row.Ref_Key); return reference ? [[reference, row] as const] : []; }));
}
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_ONEC_RESPONSE"); return value as Record<string, unknown>; }
function array(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : []; }
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function guid(value: unknown): string | null { const valueText = text(value).toLowerCase(); return GUID.test(valueText) ? valueText : null; }
function requireGuid(value: string, label: string): string { const parsed = guid(value); if (!parsed) throw new Error(`INVALID_${label.toUpperCase().replaceAll(" ", "_")}`); return parsed; }
function requireGuidValue(value: unknown, label: string): string { const parsed = guid(value); if (!parsed) throw new Error(`INVALID_ONEC_${label.toUpperCase()}`); return parsed; }
function requiredText(value: unknown, label: string): string { const result = text(value); if (!result) throw new Error(`INVALID_ONEC_${label.toUpperCase().replaceAll(" ", "_")}`); return result; }
function requiredDate(value: unknown): string { const parsed = new Date(text(value)); if (!Number.isFinite(parsed.getTime())) throw new Error("INVALID_ONEC_DATE"); return parsed.toISOString(); }
function requiredBoolean(value: unknown): boolean { if (typeof value !== "boolean") throw new Error("INVALID_ONEC_BOOLEAN"); return value; }
function amount(value: unknown): number | null { const parsed = typeof value === "number" ? value : Number(value); return Number.isFinite(parsed) ? parsed : null; }
function requiredAmount(value: unknown, label: string): number { const parsed = amount(value); if (parsed === null || parsed < 0) throw new Error(`INVALID_ONEC_${label.toUpperCase().replaceAll(" ", "_")}`); return roundMoney(parsed); }
function currencyCode(row: Record<string, unknown>): string { const normalized = normalizeOneCCurrencyCode(text(row.Code)) ?? normalizeOneCCurrencyCode(text(row.Description)); if (!normalized) throw new Error("INVALID_ONEC_CURRENCY"); return normalized; }
function customerKind(value: unknown): "PERSON" | "LEGAL_ENTITY" { const normalized = text(value); if (normalized === "ФизическоеЛицо") return "PERSON"; if (normalized === "ЮридическоеЛицо") return "LEGAL_ENTITY"; throw new Error("UNMAPPED_ONEC_CUSTOMER_KIND"); }
function settlementBalance(rows: Record<string, unknown>[], orderReference: string): number | null {
  const exact = rows.filter((row) => exactTypedOrder(row["Заказ"], row["Заказ_Type"], orderReference));
  if (!exact.length) return null;
  const values = exact.map((row) => amount(row["СуммаBalance"]));
  return values.some((value) => value === null) ? null : sum(values.filter((value): value is number => value !== null));
}
function collectionFromProjection(projection: Record<string, unknown>, section: string, field: string): Record<string, unknown>[] {
  const value = record(projection[section])[field];
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}
function roundMoney(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
function sum(values: number[]): number { return roundMoney(values.reduce((total, value) => total + value, 0)); }
function isString(value: string | null): value is string { return value !== null; }
function isLine(value: OneCCommercialOrderLine | null): value is OneCCommercialOrderLine { return value !== null; }
