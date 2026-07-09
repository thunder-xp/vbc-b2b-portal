import { IntegrationError } from "../errors";

export class SyncEngineError extends IntegrationError {
  constructor(message = "Sync Engine operation failed.") {
    super(message);
    this.name = "SyncEngineError";
  }
}

export class SyncTargetNotSupportedError extends SyncEngineError {
  constructor(message = "Sync target is not supported.") {
    super(message);
    this.name = "SyncTargetNotSupportedError";
  }
}

export class SyncProviderNotAvailableError extends SyncEngineError {
  constructor(message = "Sync provider is not available.") {
    super(message);
    this.name = "SyncProviderNotAvailableError";
  }
}

export class SyncReadModelUpdateUnavailableError extends SyncEngineError {
  constructor(message = "Sync read-model update boundary is not available.") {
    super(message);
    this.name = "SyncReadModelUpdateUnavailableError";
  }
}

export class SyncRetryLimitReachedError extends SyncEngineError {
  constructor(message = "Sync retry limit was reached.") {
    super(message);
    this.name = "SyncRetryLimitReachedError";
  }
}

export class SyncDryRunOnlyError extends SyncEngineError {
  constructor(message = "Sync operation is available only as a dry run.") {
    super(message);
    this.name = "SyncDryRunOnlyError";
  }
}
