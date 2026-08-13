export class AccessControlError extends Error {
  constructor(message = "Access control error.") {
    super(message);
    this.name = "AccessControlError";
  }
}

export class UnauthenticatedError extends AccessControlError {
  constructor(message = "Authentication is required.") {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends AccessControlError {
  constructor(message = "Access is forbidden.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AccessControlError {
  constructor(message = "Requested access control resource was not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class InvalidStateError extends AccessControlError {
  constructor(message = "Operation is not valid for the current state.") {
    super(message);
    this.name = "InvalidStateError";
  }
}

export class DomainConflictError extends AccessControlError {
  constructor(readonly code: string, message = "The resource changed. Reload it and try again.") {
    super(message);
    this.name = "DomainConflictError";
  }
}

export class DuplicateRequestError extends AccessControlError {
  constructor(message = "A duplicate access request already exists.") {
    super(message);
    this.name = "DuplicateRequestError";
  }
}

export class MembershipRequiredError extends AccessControlError {
  constructor(message = "Active company membership is required.") {
    super(message);
    this.name = "MembershipRequiredError";
  }
}

export class PermissionRequiredError extends AccessControlError {
  constructor(message = "Required permission is missing.") {
    super(message);
    this.name = "PermissionRequiredError";
  }
}

export class OperationNotAvailableError extends AccessControlError {
  constructor(message = "Operation is not available.") {
    super(message);
    this.name = "OperationNotAvailableError";
  }
}

export type ApprovalErrorCode =
  | "APPROVAL_REQUEST_NOT_FOUND"
  | "APPROVAL_REQUEST_NOT_PENDING"
  | "APPROVAL_FISCAL_CODE_REQUIRED"
  | "APPROVAL_REQUESTER_INVALID"
  | "APPROVAL_COMPANY_CONFLICT"
  | "APPROVAL_MEMBERSHIP_CONFLICT"
  | "APPROVAL_1C_BINDING_INVALID"
  | "APPROVAL_ROLE_INVALID"
  | "APPROVAL_PERMISSION_DENIED"
  | "APPROVAL_DATABASE_CONSTRAINT"
  | "APPROVAL_AUDIT_FAILURE"
  | "APPROVAL_UNKNOWN_FAILURE";

export class ApprovalError extends AccessControlError {
  constructor(
    readonly code: ApprovalErrorCode,
    readonly correlationId: string,
  ) {
    super(code);
    this.name = "ApprovalError";
  }
}
