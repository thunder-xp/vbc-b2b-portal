import "server-only";

import type { OneCEnv } from "@/src/lib/env";
import { OneCODataClient } from "@/src/modules/integration/providers/one-c/one-c-odata-client";
import {
  ONE_C_CONTRACT_FIELDS,
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

const PAGE_SIZE = 500;
const MAX_PAGES = 200;

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

    const partnerPages = await this.scan(
      ONE_C_RESOURCES.partners,
      ONE_C_PARTNER_FIELDS.join(","),
      "counterparty_directory_partners",
      (row) => {
        if (isFolderRow(row)) return;
        const parsed = parseCounterpartyRow(row);
        if (parsed) counterparties.push(parsed);
        else failedRecords += 1;
      },
    );
    const contractPages = await this.scan(
      ONE_C_RESOURCES.contracts,
      ONE_C_CONTRACT_FIELDS.join(","),
      "counterparty_directory_contracts",
      (row) => {
        const parsed = parseContractRow(row);
        if (parsed) contracts.push(parsed);
        else failedRecords += 1;
      },
    );

    const priceTypes = new Map<string, unknown>();
    const priceTypePages = await this.scan(
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

    const priceProfiles = contracts.flatMap((contract) => {
      const priceType = contract.priceTypeExternal1cId
        ? priceTypes.get(contract.priceTypeExternal1cId)
        : null;
      const profile = toPriceProfileRow(contract, priceType);
      return profile ? [profile] : [];
    });

    return {
      counterparties,
      contracts,
      priceProfiles: deduplicatePriceProfiles(priceProfiles),
      pagesProcessed: partnerPages + contractPages + priceTypePages,
      failedRecords,
    };
  }

  private async scan(
    resource: string,
    select: string,
    requestKind: string,
    visit: (row: unknown) => void,
  ): Promise<number> {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const payload = await this.client.get(
        resource,
        {
          $select: select,
          $top: String(PAGE_SIZE),
          $skip: String(page * PAGE_SIZE),
        },
        { requestKind },
      );
      const rows = readEnvelope(payload);
      rows.forEach(visit);
      if (rows.length < PAGE_SIZE) return page + 1;
    }
    throw new Error(`Bounded 1C directory scan exceeded ${MAX_PAGES} pages.`);
  }
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
