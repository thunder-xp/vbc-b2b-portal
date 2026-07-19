import type {
  ContractBalanceFetchDiagnosticsDTO,
  ContractBalanceFetchRequestDTO,
  ContractBalanceFetchResultDTO,
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
