import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

const SOURCE = "Document_ПриходнаяНакладная";
const USD_REF = "00b49bb3-63d6-11e8-80d2-000c29a58b59";
const BCRU_REF = "d5303dea-f2f5-11ec-4f83-7239d3b7bd5c";
const BCRU_MULTIPLIER = 0.9897;
const EXPECTED_NUMBER = "NSUU-000405";
const EXPECTED_DATE = "2026-06-26T10:00:00";
const EXPECTED_USD_RATE = 17.7462;
const REQUIRED_ENVIRONMENT_VARIABLES = [
  "ONEC_BASE_URL",
  "ONEC_USERNAME",
  "ONEC_PASSWORD",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type ReceiptDocumentRow = {
  Date?: unknown;
  Number?: unknown;
  Posted?: unknown;
  DeletionMark?: unknown;
  ВалютаДокумента_Key?: unknown;
  Курс?: unknown;
  Кратность?: unknown;
};

type Candidate = {
  date: string;
  number: string;
  timestamp: number;
  usdRate: number;
};

async function main(): Promise<void> {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
  const environment = readEnvironment();
  const candidate = await fetchLatestUsdReceipt(environment);
  if (
    candidate.number !== EXPECTED_NUMBER ||
    candidate.date !== EXPECTED_DATE ||
    candidate.usdRate !== EXPECTED_USD_RATE
  ) {
    throw new Error(
      `Refusing publication: selected ${candidate.date} / ${candidate.number} / ${candidate.usdRate}.`,
    );
  }
  const bcruRate = candidate.usdRate * BCRU_MULTIPLIER;

  const supabase = createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error } = await supabase.rpc("publish_commercial_exchange_rate", {
    p_source_code: "113",
    p_source_ref: BCRU_REF,
    p_base_currency_ref: USD_REF,
    p_source_document_type: SOURCE,
    p_source_document_date: candidate.date,
    p_source_mdl_per_usd_rate: candidate.usdRate,
    p_markup_percent: -1.03,
    p_bcru_mdl_per_usd_rate: bcruRate,
  });
  if (error) throw new Error(`Publication failed: ${error.message}`);

  console.log(`Selected source: ${SOURCE}`);
  console.log(`Document date: ${candidate.date}`);
  console.log(`USD rate: ${candidate.usdRate}`);
  console.log(`BCRU rate: ${bcruRate}`);
  console.log("Publication result: published");
}

async function fetchLatestUsdReceipt(environment: Environment): Promise<Candidate> {
  const requestUrl = `${environment.ONEC_BASE_URL.replace(/\/$/, "")}/${SOURCE}?$orderby=Date desc&$top=100&$select=Date,Number,Posted,DeletionMark,ВалютаДокумента_Key,Курс,Кратность&$format=json`;

  const response = await fetch(requestUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${environment.ONEC_USERNAME}:${environment.ONEC_PASSWORD}`, "utf8").toString("base64")}`,
    },
  });
  if (!response.ok) throw new Error(`1C request failed with HTTP ${response.status}.`);

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.value)) {
    throw new Error("1C returned an invalid receipt-document response.");
  }

  return selectLatestUsdReceipt(payload.value, Date.now());
}

export function selectLatestUsdReceipt(rows: unknown[], currentTime: number): Candidate {
  const selected = rows
    .map((row) => toCandidate(row, currentTime))
    .filter((candidate): candidate is Candidate => candidate !== null)
    .sort((left, right) => right.timestamp - left.timestamp)[0];
  if (!selected) throw new Error("No valid current USD receipt document was found in 1C.");
  return selected;
}

function toCandidate(value: unknown, currentTime: number): Candidate | null {
  if (!isRecord(value)) return null;
  const row: ReceiptDocumentRow = value;
  if (
    row.Posted !== true ||
    row.DeletionMark !== false ||
    row.ВалютаДокумента_Key !== USD_REF ||
    typeof row.Date !== "string"
  ) {
    return null;
  }

  const rate = Number(row.Курс);
  const multiplicity = Number(row.Кратность);
  const timestamp = new Date(row.Date).getTime();
  if (
    !Number.isFinite(rate) || rate <= 0 ||
    !Number.isFinite(multiplicity) || multiplicity <= 0 ||
    !Number.isFinite(timestamp) || timestamp > currentTime
  ) {
    return null;
  }

  return {
    date: row.Date,
    number: typeof row.Number === "string" ? row.Number : "",
    timestamp,
    usdRate: rate / multiplicity,
  };
}

type Environment = Record<(typeof REQUIRED_ENVIRONMENT_VARIABLES)[number], string>;

function readEnvironment(): Environment {
  const missing = REQUIRED_ENVIRONMENT_VARIABLES.filter(
    (name) => !process.env[name]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return Object.fromEntries(
    REQUIRED_ENVIRONMENT_VARIABLES.map((name) => [name, process.env[name]!.trim()]),
  ) as Environment;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const executedFile = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (executedFile === import.meta.url) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error.";
    console.error(`Commercial exchange-rate sync failed: ${message}`);
    process.exitCode = 1;
  });
}
