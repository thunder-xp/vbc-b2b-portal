export type CatalogPersistenceErrorMetadata = {
  code: string | null;
  databaseMessage: string | null;
  details: string | null;
  hint: string | null;
  constraint: string | null;
  batchIndex: number | null;
  batchRowCount: number | null;
};

export class CatalogPersistenceError extends Error {
  readonly errorCategory = "database_persistence_error";

  constructor(
    readonly failedStage: string,
    readonly metadata: CatalogPersistenceErrorMetadata,
  ) {
    super("Catalog persistence operation failed.");
    this.name = "CatalogPersistenceError";
  }
}

export function catalogPersistenceError(
  failedStage: string,
  error: unknown,
  batchIndex: number | null = null,
  batchRowCount: number | null = null,
): CatalogPersistenceError {
  const source = isRecord(error) ? error : {};
  return new CatalogPersistenceError(failedStage, {
    code: stringValue(source.code),
    databaseMessage: stringValue(source.message),
    details: stringValue(source.details),
    hint: stringValue(source.hint),
    constraint: stringValue(source.constraint) ?? extractConstraint(stringValue(source.details)),
    batchIndex,
    batchRowCount,
  });
}

function extractConstraint(details: string | null): string | null {
  return details?.match(/constraint\s+"([A-Za-z0-9_]+)"/i)?.[1] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
