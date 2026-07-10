export * from "./access-request.repository";
export * from "./company-membership.repository";
export * from "./invitation.repository";
export * from "./partner-company.repository";
export * from "./role-permission.repository";
export * from "./user-profile.repository";

export class RepositoryOperationNotAvailableError extends Error {
  constructor(operation: string) {
    super(`${operation} is not available under the current RLS policy.`);
    this.name = "RepositoryOperationNotAvailableError";
  }
}

export class RepositoryUnexpectedError extends Error {
  readonly operation?: string;
  readonly table?: string;
  readonly payloadKeys?: string[];

  constructor(input: {
    operation?: string;
    table?: string;
    payloadKeys?: string[];
    cause?: unknown;
  } = {}) {
    super("Access control repository operation failed.");
    this.name = "RepositoryUnexpectedError";
    this.operation = input.operation;
    this.table = input.table;
    this.payloadKeys = input.payloadKeys;
    this.cause = input.cause;
  }
}
