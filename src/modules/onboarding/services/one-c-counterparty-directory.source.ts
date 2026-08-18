import "server-only";

import type { OneCEnv } from "@/src/lib/env";
import { parseRequiredOneCGuid } from "@/src/modules/integration/providers/one-c/one-c-guid";
import { OneCODataClient } from "@/src/modules/integration/providers/one-c/one-c-odata-client";
import {
  ONE_C_CONTRACT_FIELDS,
  ONE_C_DEFAULT_PARTNER_CONTRACT_FIELDS,
  ONE_C_PARTNER_FIELDS,
  ONE_C_PRICE_TYPE_FIELDS,
  ONE_C_RESOURCES,
} from "@/src/modules/integration/providers/one-c/one-c-odata-identifiers";

import type {
  CounterpartyContractRow,
  CounterpartyDirectoryRow,
  CounterpartyDirectorySnapshot,
} from "../types";
import {
  parseContractRow,
  parseCounterpartyRow,
  toPriceProfileRow,
} from "./counterparty-directory-normalization";

const COMPLETE_COLLECTION_LIMIT = 5_000;

type ODataEnvelope = { value: unknown[] };

export class OneCCounterpartyDirectorySource {
  private readonly client: OneCODataClient;

  constructor(env: OneCEnv) {
    this.client = new OneCODataClient({
      baseUrl: env.baseUrl,
      username: env.username,
      password: env.password,
      requestTimeoutMs: env.requestTimeoutMs,
    });
  }

  async load(): Promise<CounterpartyDirectorySnapshot> {
    const counterparties: CounterpartyDirectoryRow[] = [];
    const contracts: CounterpartyContractRow[] = [];
    let failedRecords = 0;
    let sourceCounterpartyRows = 0;
    let fetchedCounterpartyRows = 0;
    let skippedCounterpartyRows = 0;

    const partnerScan = await this.scanCompleteCollection(
      ONE_C_RESOURCES.partners,
      ONE_C_PARTNER_FIELDS.join(","),
      "counterparty_directory_partners",
      (row) => {
        fetchedCounterpartyRows += 1;
        if (isFolderRow(row)) {
          skippedCounterpartyRows += 1;
          return;
        }
        sourceCounterpartyRows += 1;
        const parsed = parseCounterpartyRow(row);
        if (parsed) counterparties.push(parsed);
        else {
          failedRecords += 1;
          skippedCounterpartyRows += 1;
        }
      },
    );
    const contractScan = await this.scanCompleteCollection(
      ONE_C_RESOURCES.contracts,
      ONE_C_CONTRACT_FIELDS.join(","),
      "counterparty_directory_contracts",
      (row) => {
        const parsed = parseContractRow(row);
        if (parsed) contracts.push(parsed);
        else failedRecords += 1;
      },
    );

    const defaultContractRefs = new Set<string>();
    const defaultContractScan = await this.scanCompleteCollection(
      ONE_C_RESOURCES.defaultPartnerContracts,
      ONE_C_DEFAULT_PARTNER_CONTRACT_FIELDS.join(","),
      "counterparty_directory_default_contracts",
      (row) => {
        if (!isRecord(row)) {
          failedRecords += 1;
          return;
        }
        const contractRef = parseRequiredOneCGuid(row["Договор_Key"]);
        if (!contractRef) {
          failedRecords += 1;
          return;
        }
        if (row["ВидДоговора"] === "СПокупателем") {
          defaultContractRefs.add(contractRef);
        }
      },
    );

    const priceTypes = new Map<string, unknown>();
    const priceTypeScan = await this.scanCompleteCollection(
      ONE_C_RESOURCES.priceTypes,
      ONE_C_PRICE_TYPE_FIELDS.join(","),
      "counterparty_directory_price_types",
      (row) => {
        if (
          typeof row === "object" &&
          row !== null &&
          "Ref_Key" in row &&
          typeof row.Ref_Key === "string"
        ) {
          priceTypes.set(row.Ref_Key.toLowerCase(), row);
        } else {
          failedRecords += 1;
        }
      },
    );

    const uniqueCounterparties = deduplicateByExternal1cId(counterparties);
    const uniqueContracts = deduplicateByExternal1cId(contracts).map((contract) => ({
      ...contract,
      isDefault: defaultContractRefs.has(contract.external1cId),
    }));
    const duplicateCounterpartyRows = counterparties.length - uniqueCounterparties.length;
    console.info({
      event: "one_c_counterparty_directory_source_deduplicated",
      counterpartyRows: counterparties.length,
      uniqueCounterparties: uniqueCounterparties.length,
      duplicateCounterparties: duplicateCounterpartyRows,
      contractRows: contracts.length,
      uniqueContracts: uniqueContracts.length,
      duplicateContracts: contracts.length - uniqueContracts.length,
    });

    const priceProfiles = uniqueContracts.flatMap((contract) => {
      const priceType = contract.priceTypeExternal1cId
        ? priceTypes.get(contract.priceTypeExternal1cId)
        : null;
      const profile = toPriceProfileRow(contract, priceType);
      return profile ? [profile] : [];
    });

    return {
      complete: duplicateCounterpartyRows === 0,
      fetchedCounterpartyRows,
      sourceCounterpartyRows,
      counterparties: uniqueCounterparties,
      contracts: uniqueContracts,
      priceProfiles: deduplicatePriceProfiles(priceProfiles),
      pagesProcessed: partnerScan + contractScan + defaultContractScan + priceTypeScan,
      failedRecords,
      skippedCounterpartyRows,
      duplicateCounterpartyRows,
    };
  }

  private async scanCompleteCollection(
    resource: string,
    select: string,
    requestKind: string,
    visit: (row: unknown) => void,
  ): Promise<number> {
    const literalQuery = `$select=${select}&$top=${COMPLETE_COLLECTION_LIMIT}&$skip=0&$format=json`;
    let payload: unknown;
    try {
      payload = await this.client.getLiteral(resource, literalQuery, { requestKind });
    } catch (error) {
      console.error({
        event: "one_c_counterparty_directory_source_failed",
        requestKind,
        resource,
        top: COMPLETE_COLLECTION_LIMIT,
        ...safeProviderDiagnostic(error),
      });
      throw error;
    }
    let rows: unknown[];
    try {
      rows = readEnvelope(payload);
    } catch (error) {
      console.error({
        event: "one_c_counterparty_directory_source_failed",
        requestKind,
        resource,
        errorType: error instanceof Error ? error.name : typeof error,
        failedStage: "response_envelope",
      });
      throw error;
    }
    if (rows.length >= COMPLETE_COLLECTION_LIMIT) {
      throw Object.assign(new Error("1C directory collection reached its safety bound."), {
        name: "CounterpartyDirectoryIncompleteError",
        code: "DIRECTORY_COLLECTION_LIMIT_REACHED",
      });
    }
    rows.forEach(visit);
    console.info({
      event: "one_c_counterparty_directory_collection_loaded",
      requestKind,
      resource,
      rowsReceived: rows.length,
      collectionLimit: COMPLETE_COLLECTION_LIMIT,
      complete: true,
    });
    return 1;
  }
}

export function deduplicateByExternal1cId<T extends { external1cId: string }>(
  rows: T[],
): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = row.external1cId.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeProviderDiagnostic(error: unknown): Record<string, unknown> {
  const value = isRecord(error) ? error : null;
  const diagnostic = value && isRecord(value.diagnostic) ? value.diagnostic : null;
  return {
    errorType: error instanceof Error ? error.name : typeof error,
    failedStage: typeof diagnostic?.failedStage === "string"
      ? diagnostic.failedStage
      : "provider_request",
    statusCode: typeof diagnostic?.statusCode === "number"
      ? diagnostic.statusCode
      : null,
    receivedContentType: typeof diagnostic?.receivedContentType === "string"
      ? diagnostic.receivedContentType
      : null,
    queryParameterNames: Array.isArray(diagnostic?.queryParameterNames)
      ? diagnostic.queryParameterNames.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function readEnvelope(value: unknown): unknown[] {
  if (
    typeof value !== "object" ||
    value === null ||
    !("value" in value) ||
    !Array.isArray((value as ODataEnvelope).value)
  ) {
    throw new Error("1C directory response envelope is invalid.");
  }
  return (value as ODataEnvelope).value;
}

function isFolderRow(value: unknown): boolean {
  return typeof value === "object" && value !== null && "IsFolder" in value
    && value.IsFolder === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deduplicatePriceProfiles(
  rows: CounterpartyDirectorySnapshot["priceProfiles"],
): CounterpartyDirectorySnapshot["priceProfiles"] {
  return [
    ...new Map(
      rows.map((row) => [
        `${row.counterpartyExternal1cId}:${row.external1cId}`,
        row,
      ]),
    ).values(),
  ];
}
