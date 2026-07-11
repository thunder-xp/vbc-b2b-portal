export class IntegrationError extends Error {
  constructor(message = "Integration operation failed.") {
    super(message);
    this.name = "IntegrationError";
  }
}

export class IntegrationProviderUnavailableError extends IntegrationError {
  constructor(message = "Integration provider is unavailable.") {
    super(message);
    this.name = "IntegrationProviderUnavailableError";
  }
}

export class IntegrationUnauthorizedError extends IntegrationError {
  constructor(message = "Integration provider authentication failed.") {
    super(message);
    this.name = "IntegrationUnauthorizedError";
  }
}

export class IntegrationForbiddenError extends IntegrationError {
  constructor(message = "Integration provider access was forbidden.") {
    super(message);
    this.name = "IntegrationForbiddenError";
  }
}

export class IntegrationODataError extends IntegrationError {
  constructor(message = "Integration provider returned an OData error.") {
    super(message);
    this.name = "IntegrationODataError";
  }
}

export class IntegrationHttpError extends IntegrationError {
  constructor(message = "Integration provider returned an unexpected HTTP response.") {
    super(message);
    this.name = "IntegrationHttpError";
  }
}

export class IntegrationTimeoutError extends IntegrationError {
  constructor(message = "Integration operation timed out.") {
    super(message);
    this.name = "IntegrationTimeoutError";
  }
}

export class IntegrationMappingError extends IntegrationError {
  constructor(message = "Integration mapping failed.") {
    super(message);
    this.name = "IntegrationMappingError";
  }
}

export class IntegrationValidationError extends IntegrationError {
  constructor(message = "Integration payload validation failed.") {
    super(message);
    this.name = "IntegrationValidationError";
  }
}

export class IntegrationPartialFailureError extends IntegrationError {
  constructor(message = "Integration operation partially failed.") {
    super(message);
    this.name = "IntegrationPartialFailureError";
  }
}

export class IntegrationUnsupportedOperationError extends IntegrationError {
  constructor(message = "Integration operation is not supported.") {
    super(message);
    this.name = "IntegrationUnsupportedOperationError";
  }
}
