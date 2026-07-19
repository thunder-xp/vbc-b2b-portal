import type {
  ContractBalanceFetchRequestDTO,
  FinanceProvider,
} from "../../contracts";
import type {
  ContractBalanceDTO,
  FinanceSnapshotDTO,
  IntegrationPageResultDTO,
  InvoiceDTO,
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
const PAGE_SIZE = 200;
const MAX_PAGES = 20;
const CONTRACT_BATCH_SIZE = 40;
const CONTRACT_SELECT = "Ref_Key,Code,Description,Owner,Owner_Type,НомерДоговора,ВалютаРасчетов_Key,Организация_Key,ВидДоговора,DeletionMark,Недействителен";
const CURRENCY_SELECT = "Ref_Key,Code,Description,DeletionMark";

type BalanceRow = { Договор_Key?: unknown; СуммаBalance?: unknown };
type ContractRow = Record<string, unknown>;
type CurrencyRow = Record<string, unknown>;

export class OneCFinanceProvider implements FinanceProvider {
  private readonly client: OneCODataClient;

  constructor(private readonly config: OneCProviderConfig) {
    this.client = new OneCODataClient(config);
  }

  async fetchContractBalances(
    input: ContractBalanceFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<ContractBalanceDTO>> {
    const counterpartyRef = requireReference(input.counterpartyReference.externalId, "Counterparty");
    const organizationRef = requireReference(input.organizationReference.externalId, "Organization");
    const synchronizedAt = requireTimestamp(input.synchronizedAt);
    const condition = `Организация_Key eq guid'${organizationRef}' and Контрагент_Key eq guid'${counterpartyRef}'`;
    const resource = `${REGISTER}/Balance(Condition='${condition.replaceAll("'", "''")}',Dimensions='Договор')`;
    const balanceRows = await this.collection<BalanceRow>(resource, {}, "finance_contract_balance");
    const balances = balanceRows.flatMap((row) => {
      const contractRef = parseRequiredOneCGuid(row.Договор_Key);
      const signedBalance = finiteNumber(row.СуммаBalance);
      return contractRef && signedBalance !== null && signedBalance !== 0
        ? [{ contractRef, signedBalance }]
        : [];
    });
    if (balances.length === 0) return { items: [], nextCursor: null };

    const contracts = await this.findContracts(new Set(balances.map((row) => row.contractRef)));
    const currencyRefs = new Set(
      [...contracts.values()].map((row) => parseRequiredOneCGuid(row["ВалютаРасчетов_Key"])).filter((value): value is string => value !== null),
    );
    const currencies = await this.findCurrencies(currencyRefs);
    const items = balances.flatMap(({ contractRef, signedBalance }) => {
      const contract = contracts.get(contractRef);
      if (!contract || !isUsableCustomerContract(contract, counterpartyRef, organizationRef)) return [];
      const currencyRef = parseRequiredOneCGuid(contract["ВалютаРасчетов_Key"]);
      const currency = currencyRef ? currencies.get(currencyRef) : null;
      const currencyCode = currency ? normalizeOneCCurrencyCode(text(currency.Code) || text(currency.Description)) : null;
      if (!currencyRef || !currencyCode || currency?.DeletionMark === true) return [];
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
    return { items, nextCursor: null };
  }

  async fetchFinanceSnapshots(): Promise<IntegrationPageResultDTO<FinanceSnapshotDTO>> {
    throw new IntegrationUnsupportedOperationError("1C finance snapshots are not implemented.");
  }

  async fetchInvoices(): Promise<IntegrationPageResultDTO<InvoiceDTO>> {
    throw new IntegrationUnsupportedOperationError("1C invoice import is not implemented.");
  }

  private async findContracts(required: Set<string>): Promise<Map<string, ContractRow>> {
    const found = new Map<string, ContractRow>();
    const references = [...required];
    for (let index = 0; index < references.length; index += CONTRACT_BATCH_SIZE) {
      const batch = references.slice(index, index + CONTRACT_BATCH_SIZE);
      const filter = batch.map((reference) => `Ref_Key eq guid'${reference}'`).join(" or ");
      const rows = await this.literalContractBatch(filter);
      for (const row of rows) {
        const ref = parseRequiredOneCGuid(row.Ref_Key);
        if (ref && required.has(ref)) found.set(ref, row);
      }
    }
    if (found.size !== required.size) throw new IntegrationValidationError("1C contract balance references could not be resolved.");
    return found;
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

  private async findCurrencies(required: Set<string>): Promise<Map<string, CurrencyRow>> {
    const found = new Map<string, CurrencyRow>();
    for (let page = 0; page < MAX_PAGES && found.size < required.size; page += 1) {
      const rows = await this.collection<CurrencyRow>(CURRENCIES, {
        $select: CURRENCY_SELECT,
        $top: String(PAGE_SIZE),
        $skip: String(page * PAGE_SIZE),
      }, "finance_currency_catalog_scan");
      for (const row of rows) {
        const ref = parseRequiredOneCGuid(row.Ref_Key);
        if (ref && required.has(ref)) found.set(ref, row);
      }
      if (rows.length < PAGE_SIZE) break;
    }
    if (found.size !== required.size) throw new IntegrationValidationError("1C contract balance currencies could not be resolved.");
    return found;
  }

  private async collection<T>(resource: string, params: Record<string, string>, requestKind: string): Promise<T[]> {
    const payload = await this.client.get(resource, params, { requestKind });
    if (!payload || typeof payload !== "object" || !Array.isArray((payload as { value?: unknown }).value)) {
      throw new IntegrationValidationError("1C contract balance response is invalid.");
    }
    return (payload as { value: T[] }).value;
  }
}

function isUsableCustomerContract(row: ContractRow, counterpartyRef: string, organizationRef: string): boolean {
  return parseRequiredOneCGuid(row.Owner) === counterpartyRef
    && row.Owner_Type === "StandardODATA.Catalog_Контрагенты"
    && parseRequiredOneCGuid(row["Организация_Key"]) === organizationRef
    && row["ВидДоговора"] === "СПокупателем"
    && row.DeletionMark !== true
    && row["Недействителен"] !== true;
}

function requireReference(value: string, label: string): string {
  const parsed = parseRequiredOneCGuid(value);
  if (!parsed) throw new IntegrationValidationError(`${label} reference is invalid.`);
  return parsed;
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
