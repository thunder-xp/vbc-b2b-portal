import { IntegrationValidationError } from "../../errors";
import { getPartnerPipelineDiagnostic } from "../../services/partner-search-validation";
import {
  OneCODataResponseValidationError,
  type OneCODataSafeDiagnostic,
} from "./one-c-odata-client";

export type OneCSafeDiagnostic = OneCODataSafeDiagnostic | {
  failedStage: string | null;
  receivedContentType: null;
  requestKind: null;
  resourceName: null;
  queryParameterNames: string[];
  statusCode: null;
  jsonParseFailure: false;
  parseErrorName: null;
  bodyLength: null;
  bomDetected: false;
  emptyBody: false;
  issuePaths: string[];
};

export function getOneCSafeDiagnostic(error: unknown): OneCSafeDiagnostic | null {
  for (const candidate of errorChain(error)) {
    if (candidate instanceof OneCODataResponseValidationError) {
      return candidate.diagnostic;
    }

    const pipelineDiagnostic = getPartnerPipelineDiagnostic(candidate);
    if (pipelineDiagnostic) {
      return {
        failedStage: pipelineDiagnostic.stage,
        receivedContentType: null,
        requestKind: null,
        resourceName: null,
        queryParameterNames: [],
        statusCode: null,
        jsonParseFailure: false,
        parseErrorName: null,
        bodyLength: null,
        bomDetected: false,
        emptyBody: false,
        issuePaths: pipelineDiagnostic.issuePaths,
      };
    }

    if (candidate instanceof IntegrationValidationError) {
      return {
        failedStage: null,
        receivedContentType: null,
        requestKind: null,
        resourceName: null,
        queryParameterNames: [],
        statusCode: null,
        jsonParseFailure: false,
        parseErrorName: null,
        bodyLength: null,
        bomDetected: false,
        emptyBody: false,
        issuePaths: [],
      };
    }
  }

  return null;
}

function* errorChain(error: unknown): Generator<unknown> {
  const visited = new Set<object>();
  let current: unknown = error;

  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    yield current;
    current = "cause" in current ? current.cause : null;
  }
}
