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
  constructor() {
    super("Access control repository operation failed.");
    this.name = "RepositoryUnexpectedError";
  }
}
