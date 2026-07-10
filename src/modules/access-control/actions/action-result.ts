import {
  AccessControlError,
  DuplicateRequestError,
  ForbiddenError,
  InvalidStateError,
  MembershipRequiredError,
  NotFoundError,
  OperationNotAvailableError,
  PermissionRequiredError,
  UnauthenticatedError,
} from "../services";

export type SuccessActionResult<TData> = {
  success: true;
  errorCode: null;
  message: string;
  data: TData;
};

export type FailedActionResult = {
  success: false;
  errorCode: string;
  message: string;
  data: null;
};

export type ActionResult<TData> = SuccessActionResult<TData> | FailedActionResult;

export function success<TData>(
  message: string,
  data: TData,
): SuccessActionResult<TData> {
  return {
    success: true,
    errorCode: null,
    message,
    data,
  };
}

export function failureFromError(error: unknown): FailedActionResult {
  if (error instanceof UnauthenticatedError) {
    return failure("AUTH_REQUIRED", "Authentication is required.");
  }

  if (error instanceof ForbiddenError) {
    return failure("FORBIDDEN", "This action is not allowed.");
  }

  if (error instanceof NotFoundError) {
    return failure("NOT_FOUND", "Requested resource is not available.");
  }

  if (error instanceof InvalidStateError) {
    return failure("INVALID_STATE", "This action is not valid for the current state.");
  }

  if (error instanceof DuplicateRequestError) {
    return failure("DUPLICATE_REQUEST", "A pending request already exists.");
  }

  if (error instanceof MembershipRequiredError) {
    return failure("MEMBERSHIP_REQUIRED", "Active company membership is required.");
  }

  if (error instanceof PermissionRequiredError) {
    return failure("PERMISSION_REQUIRED", "Required permission is missing.");
  }

  if (error instanceof OperationNotAvailableError) {
    return failure("OPERATION_NOT_AVAILABLE", "This operation is not available yet.");
  }

  if (error instanceof AccessControlError) {
    return failure(
      "ACCESS_CONTROL_ERROR",
      "We could not submit your request. Please check your profile or contact Novotech support.",
    );
  }

  return failure("SYSTEM_ERROR", "Unexpected system failure.");
}

export function invalidInput(message = "Submitted input is invalid."): FailedActionResult {
  return failure("INVALID_INPUT", message);
}

function failure(errorCode: string, message: string): FailedActionResult {
  return {
    success: false,
    errorCode,
    message,
    data: null,
  };
}
