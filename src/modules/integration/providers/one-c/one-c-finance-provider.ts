import type {
  ContractBalanceFetchDiagnosticsDTO,
  ContractBalanceFetchRequestDTO,
  ContractBalanceFetchResultDTO,
  FinanceProvider,
  PaymentObligationFetchRequestDTO,
  PaymentObligationFetchResultDTO,
} from "../../contracts";
import type {
  ContractBalanceDTO,
  FinanceSnapshotDTO,
  IntegrationPageResultDTO,
  InvoiceDTO,
  PaymentAllocationDTO,
  PaymentCalendarRowDTO,
  PaymentObligationSourceDTO,
} from "../../dto";
import {
  IntegrationForbiddenError,
  IntegrationHttpError,
  IntegrationProviderUnavailableError,
  IntegrationTimeoutError,
  IntegrationUnauthorizedError,
  IntegrationUnsupportedOperationError,
  IntegrationValidationError,
} from "../../errors";
import type { OneCProviderConfig } from "./one-c-provider.config";
import { OneCODataClient } from "./one-c-odata-client";
import { parseRequiredOneCGuid } from "./one-c-guid";
import { normalizeOneCCurrencyCode } from "./one-c-currency";

const REGISTER = "AccumulationRegister_РасчетыСПокупателями";
const CONTRACTS = "Catalog_ДоговорыКонтрагентов";
const CURRENCIES = "Catalog_Валюты";
const CUSTOMER_ORDERS = "Document_ЗаказПокупателя";
const BANK_PAYMENTS = "Document_ПоступлениеНаСчет";
const CASH_PAYMENTS = "Document_ПоступлениеВКассу";
const BANK_ACCOUNTS = "Catalog_БанковскиеСчета";
const CUSTOMER_ORDER_TYPE = "StandardODATA.Document_ЗаказПокупателя";
const CONTRACT_BATCH_SIZE = 40;
const SOURCE_PAGE_SIZE = 100;
const SOURCE_MAX_PAGES = 30;
const DEFAULT_OBSERVATION_START_DATE = "2025-01-01";
const CONTRACT_SELECT = "Ref_Key,Code,Description,Owner,Owner_Type,НомерДоговора,ВалютаРасчетов_Key,Организация_Key,ВидДоговора,DeletionMark,Недействителен";
const CURRENCY_SELECT = "Ref_Key,Code,Description,DeletionMark";
const ORDER_SELECT = "Ref_Key,DataVersion,Number,Date,DeletionMark,Posted,БанковскийСчет_Key,ВалютаДокумента_Key,ДатаИзменения,Договор_Key,ЗапланироватьОплату,Контрагент_Key,Организация_Key,СуммаДокумента,ТипДенежныхСредств,СостояниеЗаказа,СостояниеЗаказа_Type,ПлатежныйКалендарь";
const PAYMENT_SELECT = "Ref_Key,DataVersion,Date,DeletionMark,Posted,Контрагент_Key,Организация_Key,РасшифровкаПлатежа";
const BANK_ACCOUNT_SELECT = "Ref_Key,Description,Code,DeletionMark,НомерСчета,ВалютаДенежныхСредств_Key,Недействителен";

type BalanceRow = { Договор_Key?: unknown; СуммаBalance?: unknown };
type ContractRow = Record<string, unknown>;
type CurrencyRow = Record<string, unknown>;
type OrderSettlementBalanceRow = { Заказ?: unknown; Заказ_Type?: unknown; СуммаBalance?: unknown };

export class OneCFinanceProvider implements FinanceProvider {
  private readonly client: OneCODataClient;

  constructor(private readonly config: OneCProviderConfig) {
    this.client = new OneCODataClient(config);
  }

  async fetchContractBalances(
    input: ContractBalanceFetchRequestDTO,
  ): Promise<ContractBalanceFetchResultDTO> {
    const counterpartyRef = requireReference(input.counterpartyReference.externalId, "Counterparty");
    const organizationRef = requireReference(input.organizationReference.externalId, "Organization");
    const synchronizedAt = requireTimestamp(input.synchronizedAt);
    const condition = `Организация_Key eq guid'${organizationRef}' and Контрагент_Key eq guid'${counterpartyRef}'`;
    const resource = `${REGISTER}/Balance(Condition='${condition.replaceAll("'", "''")}',Dimensions='Договор')`;
    const balanceRows = await this.collection<BalanceRow>(resource, {}, "finance_contract_balance");
    let zeroBalanceCount = 0;
    let invalidBalanceCount = 0;
    const balances = balanceRows.flatMap((row) => {
      const contractRef = parseRequiredOneCGuid(row.Договор_Key);
      const signedBalance = finiteNumber(row.СуммаBalance);
      if (!contractRef || signedBalance === null) { invalidBalanceCount += 1; return []; }
      if (signedBalance === 0) { zeroBalanceCount += 1; return []; }
      return [{ contractRef, signedBalance }];
    });
    if (balances.length === 0) return {
      items: [], nextCursor: null,
      diagnostics: diagnostics({ rawBalanceCount: balanceRows.length, zeroBalanceCount, invalidBalanceCount, oneCCallCount: 1 }),
    };

    const contractLookup = await this.findContracts(new Set(balances.map((row) => row.contractRef)));
    const contracts = contractLookup.rows;
    const currencyRefs = new Set(
      [...contracts.values()].map((row) => parseRequiredOneCGuid(row["ВалютаРасчетов_Key"])).filter((value): value is string => value !== null),
    );
    const currencyLookup = await this.findCurrencies(currencyRefs);
    const currencies = currencyLookup.rows;
    const counts = diagnostics({
      rawBalanceCount: balanceRows.length,
      zeroBalanceCount,
      invalidBalanceCount,
      oneCCallCount: 1 + contractLookup.callCount + currencyLookup.callCount,
    });
    const items = balances.flatMap(({ contractRef, signedBalance }) => {
      const contract = contracts.get(contractRef);
      if (!contract) { counts.missingContractCount += 1; return []; }
      if (contract.DeletionMark === true) { counts.deletedContractCount += 1; return []; }
      if (contract["Недействителен"] === true) { counts.inactiveContractCount += 1; return []; }
      if (parseRequiredOneCGuid(contract.Owner) !== counterpartyRef || contract.Owner_Type !== "StandardODATA.Catalog_Контрагенты") {
        counts.wrongCounterpartyCount += 1; return [];
      }
      if (parseRequiredOneCGuid(contract["Организация_Key"]) !== organizationRef) { counts.wrongOrganizationCount += 1; return []; }
      if (contract["ВидДоговора"] !== "СПокупателем") { counts.wrongContractTypeCount += 1; return []; }
      const currencyRef = parseRequiredOneCGuid(contract["ВалютаРасчетов_Key"]);
      const currency = currencyRef ? currencies.get(currencyRef) : null;
      const currencyCode = currency ? normalizeOneCCurrencyCode(text(currency.Code) || text(currency.Description)) : null;
      if (!currencyRef || !currency || !currencyCode) { counts.missingCurrencyCount += 1; return []; }
      if (currency.DeletionMark === true) { counts.deletedCurrencyCount += 1; return []; }
      return [{
        contractReference: reference(contractRef, "contract"),
        contractNumber: text(contract["НомерДоговора"]) || text(contract.Code),
        contractName: text(contract.Description) || text(contract["НомерДоговора"]) || text(contract.Code),
        currencyReference: reference(currencyRef, "currency"),
        currencyCode,
        signedBalance,
        sourceVersion: null,
        synchronizedAt,
      } satisfies ContractBalanceDTO];
    });
    return { items, nextCursor: null, diagnostics: counts };
  }

  async fetchPaymentObligations(
    input: PaymentObligationFetchRequestDTO,
  ): Promise<PaymentObligationFetchResultDTO> {
    const counterpartyRef = requireReference(input.counterpartyReference.externalId, "Counterparty");
    const organizationRef = requireReference(input.organizationReference.externalId, "Organization");
    requireTimestamp(input.synchronizedAt);
    const startDate = validObservationStartDate(input.observationStartDate);
    const sourceFilter = `Контрагент_Key eq guid'${counterpartyRef}' and Организация_Key eq guid'${organizationRef}' and Date ge datetime'${startDate}T00:00:00'`;
    const orderFilter = `${sourceFilter} and ЗапланироватьОплату eq true`;
    const balanceCondition = `Организация_Key eq guid'${organizationRef}' and Контрагент_Key eq guid'${counterpartyRef}'`;

    const [ordersPage, bankPage, cashPage, balanceRows] = await Promise.all([
      this.literalPages(CUSTOMER_ORDERS, ORDER_SELECT, orderFilter, "finance_payment_orders"),
      this.literalPages(BANK_PAYMENTS, PAYMENT_SELECT, sourceFilter, "finance_bank_payments"),
      this.literalPages(CASH_PAYMENTS, PAYMENT_SELECT, sourceFilter, "finance_cash_payments"),
      this.collection<OrderSettlementBalanceRow>(
        `${REGISTER}/Balance(Condition='${balanceCondition.replaceAll("'", "''")}',Dimensions='Договор,Заказ')`,
        {},
        "finance_order_balances",
      ),
    ]);

    const orderRows = ordersPage.rows.filter(isRecord);
    const contractRefs = new Set(orderRows.flatMap((row) => optionalGuid(row["Договор_Key"])));
    const orderCurrencyRefs = new Set(orderRows.flatMap((row) => optionalGuid(row["ВалютаДокумента_Key"])));
    const bankAccountRefs = new Set(orderRows.flatMap((row) => optionalGuid(row["БанковскийСчет_Key"])));
    const contractLookup = await this.findContracts(contractRefs);
    const contractCurrencyRefs = new Set(
      [...contractLookup.rows.values()].flatMap((row) => optionalGuid(row["ВалютаРасчетов_Key"])),
    );
    const currencyLookup = await this.findCurrencies(new Set([...orderCurrencyRefs, ...contractCurrencyRefs]));
    const accountLookup = await this.findBankAccounts(bankAccountRefs);
    const balances = orderBalanceMap(balanceRows);
    const allocations = paymentAllocationMap([
      ...paymentDocumentAllocations(bankPage.rows, "bank"),
      ...paymentDocumentAllocations(cashPage.rows, "cash"),
    ]);

    const items = orderRows.flatMap((row) => mapPaymentObligationSource({
      row,
      expectedCounterpartyRef: counterpartyRef,
      expectedOrganizationRef: organizationRef,
      contracts: contractLookup.rows,
      currencies: currencyLookup.rows,
      bankAccounts: accountLookup.rows,
      balances,
      allocations,
    }));
    return {
      items,
      nextCursor: null,
      diagnostics: {
        ordersReceived: orderRows.length,
        paymentCalendarOrders: items.filter((item) => item.calendarRows.length > 0).length,
        emptyCalendarOrders: items.filter((item) => item.calendarRows.length === 0).length,
        bankPaymentsReceived: bankPage.rows.length,
        cashPaymentsReceived: cashPage.rows.length,
        balanceRowsReceived: balanceRows.length,
        oneCCallCount: ordersPage.callCount + bankPage.callCount + cashPage.callCount + 1
          + contractLookup.callCount + currencyLookup.callCount + accountLookup.callCount,
      },
    };
  }

  async fetchFinanceSnapshots(): Promise<IntegrationPageResultDTO<FinanceSnapshotDTO>> {
    throw new IntegrationUnsupportedOperationError("1C finance snapshots are not implemented.");
  }

  async fetchInvoices(): Promise<IntegrationPageResultDTO<InvoiceDTO>> {
    throw new IntegrationUnsupportedOperationError("1C invoice import is not implemented.");
  }

  private async findContracts(required: Set<string>): Promise<{ rows: Map<string, ContractRow>; callCount: number }> {
    const found = new Map<string, ContractRow>();
    const references = [...required];
    let callCount = 0;
    for (let index = 0; index < references.length; index += CONTRACT_BATCH_SIZE) {
      const batch = references.slice(index, index + CONTRACT_BATCH_SIZE);
      const filter = batch.map((reference) => `Ref_Key eq guid'${reference}'`).join(" or ");
      const rows = await this.literalContractBatch(filter);
      callCount += 1;
      for (const row of rows) {
        const ref = parseRequiredOneCGuid(row.Ref_Key);
        if (ref && required.has(ref)) found.set(ref, row);
      }
    }
    return { rows: found, callCount };
  }

  private async literalContractBatch(filter: string): Promise<ContractRow[]> {
    const { baseUrl, username, password } = this.config;
    if (!baseUrl || !username || !password) throw new IntegrationProviderUnavailableError("1C OData is not configured.");
    const url = `${baseUrl.replace(/\/$/, "")}/${CONTRACTS}?$select=${CONTRACT_SELECT}&$filter=${filter}&$top=${CONTRACT_BATCH_SIZE}&$format=json`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json", Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}` },
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new IntegrationTimeoutError("1C contract lookup timed out.");
      throw new IntegrationProviderUnavailableError("1C contract lookup is unavailable.");
    }
    if (response.status === 401) throw new IntegrationUnauthorizedError();
    if (response.status === 403) throw new IntegrationForbiddenError();
    if (!response.ok) throw new IntegrationHttpError();
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !Array.isArray((payload as { value?: unknown }).value)) {
      throw new IntegrationValidationError("1C contract lookup response is invalid.");
    }
    return (payload as { value: ContractRow[] }).value;
  }

  private async findCurrencies(required: Set<string>): Promise<{ rows: Map<string, CurrencyRow>; callCount: number }> {
    const found = new Map<string, CurrencyRow>();
    const references = [...required];
    let callCount = 0;
    for (let index = 0; index < references.length; index += CONTRACT_BATCH_SIZE) {
      const batch = references.slice(index, index + CONTRACT_BATCH_SIZE);
      const filter = batch.map((reference) => `Ref_Key eq guid'${reference}'`).join(" or ");
      const rows = await this.literalCurrencyBatch(filter);
      callCount += 1;
      for (const row of rows) {
        const ref = parseRequiredOneCGuid(row.Ref_Key);
        if (ref && required.has(ref)) found.set(ref, row);
      }
    }
    return { rows: found, callCount };
  }

  private async findBankAccounts(required: Set<string>): Promise<{ rows: Map<string, Record<string, unknown>>; callCount: number }> {
    const found = new Map<string, Record<string, unknown>>();
    const references = [...required];
    let callCount = 0;
    for (let index = 0; index < references.length; index += CONTRACT_BATCH_SIZE) {
      const batch = references.slice(index, index + CONTRACT_BATCH_SIZE);
      const filter = batch.map((reference) => `Ref_Key eq guid'${reference}'`).join(" or ");
      const rows = await this.literalCollection(BANK_ACCOUNTS, BANK_ACCOUNT_SELECT, filter, batch.length, 0, "finance_bank_accounts");
      callCount += 1;
      for (const row of rows) {
        const ref = parseRequiredOneCGuid(row.Ref_Key);
        if (ref && required.has(ref) && row.DeletionMark !== true && row["Недействителен"] !== true) found.set(ref, row);
      }
    }
    return { rows: found, callCount };
  }

  private async literalPages(resource: string, select: string, filter: string, requestKind: string): Promise<{ rows: Record<string, unknown>[]; callCount: number }> {
    const rows: Record<string, unknown>[] = [];
    for (let page = 0; page < SOURCE_MAX_PAGES; page += 1) {
      const current = await this.literalCollection(resource, select, filter, SOURCE_PAGE_SIZE, page * SOURCE_PAGE_SIZE, requestKind);
      rows.push(...current);
      if (current.length < SOURCE_PAGE_SIZE) return { rows, callCount: page + 1 };
    }
    throw new IntegrationValidationError("1C finance source exceeded its bounded page limit.");
  }

  private async literalCollection(resource: string, select: string, filter: string, top: number, skip: number, requestKind: string): Promise<Record<string, unknown>[]> {
    const { baseUrl, username, password } = this.config;
    if (!baseUrl || !username || !password) throw new IntegrationProviderUnavailableError("1C OData is not configured.");
    const url = `${baseUrl.replace(/\/$/, "")}/${resource}?$select=${select}&$filter=${filter}&$top=${top}&$skip=${skip}&$format=json`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json", Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}` },
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) throw new IntegrationTimeoutError(`1C ${requestKind} timed out.`);
      throw new IntegrationProviderUnavailableError(`1C ${requestKind} is unavailable.`);
    }
    if (response.status === 401) throw new IntegrationUnauthorizedError();
    if (response.status === 403) throw new IntegrationForbiddenError();
    if (!response.ok) {
      console.error({
        event: "finance_odata_request_failed",
        requestKind,
        resourceName: resource,
        statusCode: response.status,
      });
      throw new IntegrationHttpError();
    }
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.value)) throw new IntegrationValidationError(`1C ${requestKind} response is invalid.`);
    return payload.value.filter(isRecord);
  }

  private async literalCurrencyBatch(filter: string): Promise<CurrencyRow[]> {
    const { baseUrl, username, password } = this.config;
    if (!baseUrl || !username || !password) throw new IntegrationProviderUnavailableError("1C OData is not configured.");
    const url = `${baseUrl.replace(/\/$/, "")}/${CURRENCIES}?$select=${CURRENCY_SELECT}&$filter=${filter}&$top=${CONTRACT_BATCH_SIZE}&$format=json`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json", Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}` },
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new IntegrationTimeoutError("1C currency lookup timed out.");
      throw new IntegrationProviderUnavailableError("1C currency lookup is unavailable.");
    }
    if (response.status === 401) throw new IntegrationUnauthorizedError();
    if (response.status === 403) throw new IntegrationForbiddenError();
    if (!response.ok) throw new IntegrationHttpError();
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !Array.isArray((payload as { value?: unknown }).value)) {
      throw new IntegrationValidationError("1C currency lookup response is invalid.");
    }
    return (payload as { value: CurrencyRow[] }).value;
  }

  private async collection<T>(resource: string, params: Record<string, string>, requestKind: string): Promise<T[]> {
    const payload = await this.client.get(resource, params, { requestKind });
    if (!payload || typeof payload !== "object" || !Array.isArray((payload as { value?: unknown }).value)) {
      throw new IntegrationValidationError("1C contract balance response is invalid.");
    }
    return (payload as { value: T[] }).value;
  }
}

function requireReference(value: string, label: string): string {
  const parsed = parseRequiredOneCGuid(value);
  if (!parsed) throw new IntegrationValidationError(`${label} reference is invalid.`);
  return parsed;
}

function diagnostics(input: Partial<ContractBalanceFetchDiagnosticsDTO>): ContractBalanceFetchDiagnosticsDTO {
  return {
    rawBalanceCount: 0, zeroBalanceCount: 0, invalidBalanceCount: 0, missingContractCount: 0,
    deletedContractCount: 0, inactiveContractCount: 0, wrongCounterpartyCount: 0,
    wrongOrganizationCount: 0, wrongContractTypeCount: 0, missingCurrencyCount: 0,
    deletedCurrencyCount: 0, oneCCallCount: 0, ...input,
  };
}

function requireTimestamp(value: string): string {
  if (!Number.isFinite(Date.parse(value))) throw new IntegrationValidationError("Synchronization time is invalid.");
  return new Date(value).toISOString();
}

function finiteNumber(value: unknown): number | null {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) ? result : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function reference(externalId: string, externalType: string) {
  return { providerCode: "one-c", externalId, externalType };
}

function validObservationStartDate(value: string | undefined): string {
  const result = value?.trim() || DEFAULT_OBSERVATION_START_DATE;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(Date.parse(`${result}T00:00:00Z`))) {
    throw new IntegrationValidationError("Finance observation start date is invalid.");
  }
  return result;
}

function optionalGuid(value: unknown): string[] {
  const parsed = parseRequiredOneCGuid(value);
  return parsed ? [parsed] : [];
}

function isoTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timezoneLess = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (timezoneLess) {
    const [, year, month, day, hour, minute, second, milliseconds = "0"] = timezoneLess;
    const localWallClock = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Number(milliseconds.padEnd(3, "0")));
    const firstOffset = chisinauOffsetMs(localWallClock);
    const utc = localWallClock - chisinauOffsetMs(localWallClock - firstOffset);
    const parsed = new Date(utc);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function oneCDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = value.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/)?.[1] ?? null;
  return date && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ? date : null;
}

function chisinauOffsetMs(timestamp: number): number {
  const wholeSecond = Math.trunc(timestamp / 1000) * 1000;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Chisinau", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(wholeSecond));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)) - wholeSecond;
}

function mapCalendarRows(value: unknown): PaymentCalendarRowDTO[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const lineNumber = finiteNumber(candidate.LineNumber);
    const dueDate = oneCDate(candidate["ДатаОплаты"]);
    const paymentPercent = finiteNumber(candidate["ПроцентОплаты"]);
    const plannedAmount = finiteNumber(candidate["СуммаОплаты"]);
    const vatAmount = finiteNumber(candidate["СуммаНДСОплаты"]);
    return lineNumber !== null && Number.isSafeInteger(lineNumber) && lineNumber >= 0 && dueDate
      && paymentPercent !== null && plannedAmount !== null && vatAmount !== null
      ? [{ lineNumber, dueDate, paymentPercent, plannedAmount, vatAmount }]
      : [];
  });
}

function paymentDocumentAllocations(rows: Record<string, unknown>[], paymentType: "bank" | "cash"): Array<{ orderRef: string; allocation: PaymentAllocationDTO }> {
  return rows.flatMap((document) => {
    const paymentRef = parseRequiredOneCGuid(document.Ref_Key);
    const paymentDate = isoTimestamp(document.Date);
    const posted = document.Posted;
    const deletionMarked = document.DeletionMark;
    if (!paymentRef || !paymentDate || typeof posted !== "boolean" || typeof deletionMarked !== "boolean") return [];
    const breakdown = Array.isArray(document["РасшифровкаПлатежа"]) ? document["РасшифровкаПлатежа"] : [];
    return breakdown.flatMap((candidate) => {
      if (!isRecord(candidate) || candidate["Заказ_Type"] !== CUSTOMER_ORDER_TYPE) return [];
      const orderRef = parseRequiredOneCGuid(candidate["Заказ"]);
      const amount = finiteNumber(candidate["СуммаРасчетов"]);
      if (!orderRef || amount === null || amount < 0) return [];
      return [{ orderRef, allocation: {
        paymentReference: reference(paymentRef, paymentType === "bank" ? BANK_PAYMENTS : CASH_PAYMENTS),
        paymentType,
        paymentDate,
        sourceVersion: text(document.DataVersion) || null,
        posted,
        deletionMarked,
        settlementAmount: amount,
      } satisfies PaymentAllocationDTO }];
    });
  });
}

function paymentAllocationMap(rows: Array<{ orderRef: string; allocation: PaymentAllocationDTO }>): Map<string, PaymentAllocationDTO[]> {
  const result = new Map<string, PaymentAllocationDTO[]>();
  for (const row of rows) result.set(row.orderRef, [...(result.get(row.orderRef) ?? []), row.allocation]);
  return result;
}

function orderBalanceMap(rows: OrderSettlementBalanceRow[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const row of rows) {
    if (row["Заказ_Type"] !== CUSTOMER_ORDER_TYPE) continue;
    const orderRef = parseRequiredOneCGuid(row["Заказ"]);
    const balance = finiteNumber(row["СуммаBalance"]);
    if (orderRef && balance !== null) result.set(orderRef, (result.get(orderRef) ?? 0) + balance);
  }
  return result;
}

function mapPaymentObligationSource(input: {
  row: Record<string, unknown>;
  expectedCounterpartyRef: string;
  expectedOrganizationRef: string;
  contracts: Map<string, ContractRow>;
  currencies: Map<string, CurrencyRow>;
  bankAccounts: Map<string, Record<string, unknown>>;
  balances: Map<string, number>;
  allocations: Map<string, PaymentAllocationDTO[]>;
}): PaymentObligationSourceDTO[] {
  const orderRef = parseRequiredOneCGuid(input.row.Ref_Key);
  const orderDate = oneCDate(input.row.Date);
  if (!orderRef || !orderDate || typeof input.row.Posted !== "boolean" || typeof input.row.DeletionMark !== "boolean") return [];
  const counterpartyRef = parseRequiredOneCGuid(input.row["Контрагент_Key"]);
  const organizationRef = parseRequiredOneCGuid(input.row["Организация_Key"]);
  if (counterpartyRef !== input.expectedCounterpartyRef || organizationRef !== input.expectedOrganizationRef) return [];
  const contractRef = parseRequiredOneCGuid(input.row["Договор_Key"]);
  const orderCurrencyRef = parseRequiredOneCGuid(input.row["ВалютаДокумента_Key"]);
  const contract = contractRef ? input.contracts.get(contractRef) : null;
  const contractCurrencyRef = contract ? parseRequiredOneCGuid(contract["ВалютаРасчетов_Key"]) : null;
  const accountRef = parseRequiredOneCGuid(input.row["БанковскийСчет_Key"]);
  const account = accountRef ? input.bankAccounts.get(accountRef) : null;
  const allocations = (input.allocations.get(orderRef) ?? []).filter((row) => row.posted && !row.deletionMarked);
  const paidAmount = allocations.reduce((sum, row) => sum + row.settlementAmount, 0);
  const latestPaymentAt = allocations.reduce<string | null>((latest, row) => !latest || row.paymentDate > latest ? row.paymentDate : latest, null);
  return [{
    orderReference: reference(orderRef, CUSTOMER_ORDERS),
    orderNumber: text(input.row.Number),
    orderDate,
    counterpartyReference: counterpartyRef ? reference(counterpartyRef, "counterparty") : null,
    contractReference: contractRef ? reference(contractRef, "contract") : null,
    organizationReference: organizationRef ? reference(organizationRef, "organization") : null,
    sourceOrderDataVersion: text(input.row.DataVersion) || null,
    sourceModifiedAt: isoTimestamp(input.row["ДатаИзменения"]),
    orderPosted: input.row.Posted,
    orderDeletionMarked: input.row.DeletionMark,
    orderStatus: text(input.row["СостояниеЗаказа"]) || null,
    paymentMethod: text(input.row["ТипДенежныхСредств"]),
    bankAccountReference: accountRef ? reference(accountRef, "bank-account") : null,
    bankAccountName: account ? text(account.Description) || text(account.Code) || null : null,
    orderCurrencyReference: orderCurrencyRef ? reference(orderCurrencyRef, "currency") : null,
    orderCurrencyCode: currencyCode(input.currencies, orderCurrencyRef),
    contractCurrencyReference: contractCurrencyRef ? reference(contractCurrencyRef, "currency") : null,
    contractCurrencyCode: currencyCode(input.currencies, contractCurrencyRef),
    calendarRows: mapCalendarRows(input.row["ПлатежныйКалендарь"]),
    paidAmount,
    remainingAmount: input.balances.has(orderRef) ? input.balances.get(orderRef)! : null,
    latestPaymentAt,
    allocations,
  }];
}

function currencyCode(currencies: Map<string, CurrencyRow>, referenceValue: string | null): string | null {
  const currency = referenceValue ? currencies.get(referenceValue) : null;
  if (!currency || currency.DeletionMark === true) return null;
  return normalizeOneCCurrencyCode(text(currency.Code) || text(currency.Description));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
