import { IntegrationValidationError } from "../../errors";
import { getOneCODataErrorResponseBody, OneCODataClient } from "./one-c-odata-client";

export const ONE_C_BCRU_CODE = "113";
export const ONE_C_BCRU_REF = "d5303dea-f2f5-11ec-4f83-7239d3b7bd5c";
export const ONE_C_USD_REF = "00b49bb3-63d6-11e8-80d2-000c29a58b59";
export const ONE_C_BCRU_MARKUP_PERCENT = -1.03;
export const ONE_C_EXCHANGE_RATE_DOCUMENT = "Document_ПриходнаяНакладная" as const;

const DOCUMENT_FIELDS = ["Date", "Number", "Posted", "DeletionMark", "ВалютаДокумента_Key", "Курс", "Кратность"].join(",");

export type OneCExchangeRateDocumentSource = typeof ONE_C_EXCHANGE_RATE_DOCUMENT;
export type OneCExchangeRateCandidate = { source: OneCExchangeRateDocumentSource; documentDate: string; mdlPerUsdRate: number };
export interface ExchangeRateProvider { fetchLatestUsdRate(): Promise<OneCExchangeRateCandidate | null>; }

export class OneCExchangeRateSourceError extends Error {
  constructor(readonly source: OneCExchangeRateDocumentSource, cause: unknown) {
    super(`1C exchange-rate source failed: ${source}.`, { cause });
    this.name = "OneCExchangeRateSourceError";
  }
}

export class OneCExchangeRateProvider implements ExchangeRateProvider {
  private readonly client: OneCODataClient;

  constructor(
    config: { baseUrl: string | null; username: string | null; password: string | null; requestTimeoutMs: number },
    private readonly now: () => Date = () => new Date(),
  ) {
    this.client = new OneCODataClient(config);
  }

  async fetchLatestUsdRate(): Promise<OneCExchangeRateCandidate | null> {
    return this.fetchLatestFromSource(ONE_C_EXCHANGE_RATE_DOCUMENT, this.now().getTime());
  }

  private async fetchLatestFromSource(source: OneCExchangeRateDocumentSource, currentTime: number): Promise<OneCExchangeRateCandidate | null> {
    try {
      const payload = await this.client.get(source, {
        $select: DOCUMENT_FIELDS,
        $orderby: "Date desc",
        $top: "100",
      }, { requestKind: "exchange_rate_document_query" });
      if (!isRecord(payload) || !Array.isArray(payload.value)) throw new IntegrationValidationError("1C exchange-rate document response is invalid.");
      const selected = payload.value
        .map((value) => mapCandidate(source, value, currentTime))
        .filter((candidate): candidate is RankedExchangeRateCandidate => candidate !== null)
        .sort((left, right) => right.documentTimestamp - left.documentTimestamp)[0];
      if (!selected) return null;
      const { documentTimestamp: _documentTimestamp, ...candidate } = selected;
      return candidate;
    } catch (error) {
      throw new OneCExchangeRateSourceError(source, error);
    }
  }
}

export function getOneCExchangeRateFailureDetails(error: unknown): { source: string | null; responseBody: string | null } {
  let current: unknown = error;
  let source: string | null = null;
  const visited = new Set<unknown>();

  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if (!source && current instanceof OneCExchangeRateSourceError) source = current.source;
    current = "cause" in current ? current.cause : null;
  }

  return { source, responseBody: getOneCODataErrorResponseBody(error) };
}

type RankedExchangeRateCandidate = OneCExchangeRateCandidate & { documentTimestamp: number };

function mapCandidate(source: OneCExchangeRateDocumentSource, value: unknown, currentTime: number): RankedExchangeRateCandidate | null {
  if (!isRecord(value) || value.Posted !== true || value.DeletionMark !== false || value["ВалютаДокумента_Key"] !== ONE_C_USD_REF) {
    return null;
  }
  const rate = positiveNumber(value["Курс"]);
  const multiplicity = positiveNumber(value["Кратность"]);
  if (typeof value.Date !== "string") return null;
  const documentTimestamp = new Date(value.Date).getTime();
  if (rate === null || multiplicity === null || !Number.isFinite(documentTimestamp) || documentTimestamp > currentTime) return null;
  return { source, documentDate: value.Date, documentTimestamp, mdlPerUsdRate: rate / multiplicity };
}

function positiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" || typeof value === "string"
    ? Number(value)
    : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
