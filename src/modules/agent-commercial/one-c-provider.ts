import "server-only";

import { getOneCEnv } from "@/src/lib/env";
import { OneCProvider } from "@/src/modules/integration/providers/one-c/one-c-provider";
import { OneCODataClient } from "@/src/modules/integration/providers/one-c/one-c-odata-client";
import type { OneCAgentCandidate, OneCCommercialOrderCandidate, OneCCommercialOrderLine } from "./types";

const GUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const ORDER_RESOURCE = "Document_ЗаказПокупателя";
const DELIVERY_RESOURCE = "Document_РасходнаяНакладная";
const COUNTERPARTY_RESOURCE = "Catalog_Контрагенты";
const CURRENCY_RESOURCE = "Catalog_Валюты";
const NOMENCLATURE_RESOURCE = "Catalog_Номенклатура";
const ORDER_TYPE = "StandardODATA.Document_ЗаказПокупателя";
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
    const deliveryPayload = await this.client.getFilteredCollection(DELIVERY_RESOURCE, {
      select: "Ref_Key,Number,Date,Posted,DeletionMark,Контрагент_Key,Заказ,Заказ_Type,ДокументОснование,ДокументОснование_Type,СуммаДокумента,DataVersion",
      filter: `(Заказ eq guid'${order.reference}' and Заказ_Type eq '${ORDER_TYPE}') or (ДокументОснование eq guid'${order.reference}' and ДокументОснование_Type eq '${ORDER_TYPE}')`,
      top: 20,
    }, { requestKind: "agent_commercial_realization_evidence" });
    const deliveries = collection(deliveryPayload).filter((row) =>
      guid(row.Ref_Key) && row.Posted === true && row.DeletionMark === false &&
      guid(row["Контрагент_Key"]) === order.customerRef && amount(row["СуммаДокумента"]) !== null);

    const finance = await this.provider.finance.fetchPaymentObligations({
      counterpartyReference: external(order.customerRef, "counterparty"),
      organizationReference: external(order.organizationRef, "organization"),
      synchronizedAt: new Date().toISOString(),
      observationStartDate: order.date.slice(0, 10),
    });
    const obligation = finance.items.find((item) => item.orderReference.externalId.toLowerCase() === order.reference);
    const remaining = obligation?.remainingAmount ?? null;
    const paid = obligation?.paidAmount ?? 0;
    const realizedGross = sum(deliveries.map((row) => amount(row["СуммаДокумента"]) ?? 0));
    const orderLineGross = sum(order.lines.map((line) => line.gross));
    const realizationComplete = deliveries.length > 0 && order.lines.length > 0 &&
      Math.abs(realizedGross - order.grossAmount) <= 0.01 && Math.abs(orderLineGross - order.grossAmount) <= 0.01;
    const reconciliationRequired = !obligation || (deliveries.length > 0 && !realizationComplete);
    const fullyPaid = !reconciliationRequired && remaining !== null && remaining <= 0 && paid + 0.01 >= order.grossAmount;
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
        refs: deliveries.map((row) => guid(row.Ref_Key)),
        realizedAt: realized ? latestDate(deliveries.map((row) => text(row.Date))) : null,
        gross: realized ? order.grossAmount.toFixed(2) : "0.00",
        vat: realized ? sum(order.lines.map((line) => line.vat)).toFixed(2) : "0.00",
        net: realized ? sum(order.lines.map((line) => line.net)).toFixed(2) : "0.00",
      },
      payment: {
        paidGross: paid.toFixed(2),
        remainingGross: remaining === null ? null : Math.max(0, remaining).toFixed(2),
        fullyPaidAt: fullyPaid ? obligation?.latestPaymentAt ?? null : null,
        reconciliationRequired,
      },
      lines: order.lines.map((line) => ({
        ...line,
        realizationRef: guid(deliveries[0]?.Ref_Key),
        gross: line.gross.toFixed(2), vat: line.vat.toFixed(2), net: line.net.toFixed(2),
      })),
      sourceVersion: [order.sourceVersion, ...deliveries.map((row) => text(row.DataVersion))].filter(Boolean).join(":"),
      observedAt: new Date().toISOString(),
    };
  }

  private async readOrder(reference: string): Promise<OneCCommercialOrderCandidate> {
    const payload = await this.client.get(`${ORDER_RESOURCE}(guid'${reference}')`, {
      $select: `${ORDER_SELECT},Запасы,Услуги`,
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
function currencyCode(row: Record<string, unknown>): string { const value = text(row.Code) || text(row.Description); const normalized = value.toUpperCase() === "LEI" ? "MDL" : value.toUpperCase(); if (!/^[A-Z]{3}$/.test(normalized)) throw new Error("INVALID_ONEC_CURRENCY"); return normalized; }
function customerKind(value: unknown): "PERSON" | "LEGAL_ENTITY" { const normalized = text(value); if (normalized === "ФизическоеЛицо") return "PERSON"; if (normalized === "ЮридическоеЛицо") return "LEGAL_ENTITY"; throw new Error("UNMAPPED_ONEC_CUSTOMER_KIND"); }
function external(externalId: string, externalType: string) { return { providerCode: "one-c", externalId, externalType }; }
function roundMoney(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
function sum(values: number[]): number { return roundMoney(values.reduce((total, value) => total + value, 0)); }
function latestDate(values: string[]): string | null { const valid = values.map((value) => new Date(value)).filter((value) => Number.isFinite(value.getTime())).sort((a, b) => b.getTime() - a.getTime()); return valid[0]?.toISOString() ?? null; }
function isString(value: string | null): value is string { return value !== null; }
function isLine(value: OneCCommercialOrderLine | null): value is OneCCommercialOrderLine { return value !== null; }
