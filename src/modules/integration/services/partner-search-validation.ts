import { z, ZodError } from "zod";

import type {
  IntegrationPageResultDTO,
  PartnerSearchResultDTO,
} from "../dto";
import { IntegrationValidationError } from "../errors";

export type PartnerPipelineStage =
  | "odata_response"
  | "odata_envelope"
  | "raw_rows"
  | "dto_mapping"
  | "partner_contract_scan"
  | "contract_mapping"
  | "price_type_lookup"
  | "provider_output"
  | "provider_return"
  | "service_input"
  | "service_output";

export type PartnerPipelineDiagnostic = {
  stage: PartnerPipelineStage;
  resultShape: string;
  resultCount: number | null;
  issuePaths: string[];
  expectedTypes: string[];
  receivedTypes: string[];
};

export class PartnerPipelineValidationError extends IntegrationValidationError {
  constructor(readonly diagnostic: PartnerPipelineDiagnostic) {
    super("1C partner search pipeline validation failed.");
    this.name = "PartnerPipelineValidationError";
  }
}

const externalReferenceSchema = z.object({
  providerCode: z.string(),
  externalId: z.string(),
  externalType: z.string(),
});

const metadataSchema = z.object({
  sourceReference: externalReferenceSchema,
  sourceUpdatedAt: z.string().nullable(),
  importedAt: z.string().nullable(),
});

const partnerContractSchema = z.object({
  reference: externalReferenceSchema,
  code: z.string(),
  name: z.string(),
  number: z.string().nullable(),
  date: z.string().nullable(),
  contractType: z.string().nullable(),
  organizationReference: externalReferenceSchema.nullable(),
  isDefault: z.boolean(),
  active: z.boolean(),
  priceTypeReference: externalReferenceSchema.nullable(),
  priceTypeName: z.string().nullable(),
  priceTypeSource: z.enum(["counterparty", "contract"]).nullable(),
});

const partnerPriceTypeSchema = z.object({
  reference: externalReferenceSchema,
  name: z.string(),
  currency: z.string().nullable(),
  includesVat: z.boolean().nullable(),
  type: z.string().nullable(),
  isDefault: z.boolean(),
  active: z.boolean(),
});

const partnerSearchResultSchema = z.object({
  reference: externalReferenceSchema,
  displayName: z.string(),
  legalName: z.string().nullable(),
  taxId: z.string().nullable(),
  status: z.string(),
  managerReference: externalReferenceSchema.nullable(),
  metadata: metadataSchema,
  code: z.string(),
  fullName: z.string().nullable(),
  active: z.boolean(),
  buyer: z.boolean(),
  supplier: z.boolean(),
  contracts: z.array(partnerContractSchema),
  priceTypes: z.array(partnerPriceTypeSchema),
});

const partnerSearchPageSchema = z.object({
  items: z.array(partnerSearchResultSchema),
  nextCursor: z.string().nullable(),
});

export function validatePartnerSearchPage(
  value: unknown,
  stage: "provider_output" | "service_input" | "service_output",
): IntegrationPageResultDTO<PartnerSearchResultDTO> {
  const result = partnerSearchPageSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  const diagnostic = diagnosticFromZodError(stage, result.error, value);
  logPipelineFailure(diagnostic);
  throw new PartnerPipelineValidationError(diagnostic);
}

export function logPipelineProgress(
  stage: PartnerPipelineStage,
  resultShape: string,
  resultCount: number | null,
): void {
  console.info({
    event: "one_c_partner_pipeline_progress",
    stage,
    resultShape,
    resultCount,
  });
}

export function getPartnerPipelineDiagnostic(
  error: unknown,
): PartnerPipelineDiagnostic | null {
  return error instanceof PartnerPipelineValidationError ? error.diagnostic : null;
}

function diagnosticFromZodError(
  stage: PartnerPipelineStage,
  error: ZodError,
  value: unknown,
): PartnerPipelineDiagnostic {
  return {
    stage,
    resultShape: resultShape(value),
    resultCount: resultCount(value),
    issuePaths: error.issues.map((issue) => issue.path.join(".") || "root"),
    expectedTypes: error.issues.map((issue) => safeExpected(issue)),
    receivedTypes: error.issues.map((issue) => safeReceived(issue)),
  };
}

function logPipelineFailure(diagnostic: PartnerPipelineDiagnostic): void {
  console.error({
    event: "one_c_partner_pipeline_validation_failed",
    stage: diagnostic.stage,
    errorCategory: "invalid_response",
    resultShape: diagnostic.resultShape,
    resultCount: diagnostic.resultCount,
    issuePaths: diagnostic.issuePaths,
    expectedTypes: diagnostic.expectedTypes,
    receivedTypes: diagnostic.receivedTypes,
  });
}

function safeExpected(issue: ZodError["issues"][number]): string {
  return "expected" in issue && typeof issue.expected === "string"
    ? issue.expected
    : issue.code;
}

function safeReceived(issue: ZodError["issues"][number]): string {
  return "received" in issue && typeof issue.received === "string"
    ? issue.received
    : "unknown";
}

function resultShape(value: unknown): string {
  if (Array.isArray(value)) return "array";
  return value === null ? "null" : typeof value;
}

function resultCount(value: unknown): number | null {
  if (typeof value === "object" && value !== null && "items" in value) {
    const items = (value as { items?: unknown }).items;
    return Array.isArray(items) ? items.length : null;
  }
  return Array.isArray(value) ? value.length : null;
}
