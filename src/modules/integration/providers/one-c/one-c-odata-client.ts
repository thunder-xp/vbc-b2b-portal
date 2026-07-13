import {
  IntegrationProviderUnavailableError,
  IntegrationForbiddenError,
  IntegrationHttpError,
  IntegrationODataError,
  IntegrationTimeoutError,
  IntegrationUnauthorizedError,
  IntegrationValidationError,
} from "../../errors";

export type OneCODataClientConfig = {
  baseUrl: string | null;
  username: string | null;
  password: string | null;
  requestTimeoutMs: number;
};

export type OneCODataProbeResult = {
  statusCode: number;
  contentType: string | null;
  durationMs: number;
  hostname: string;
  requestKind: string;
  resourceName: string;
  queryParameterNames: string[];
  jsonParsed: boolean;
  parseErrorName: string | null;
  bodyLength: number | null;
  bomDetected: boolean;
  emptyBody: boolean;
  payload: unknown;
};

export type OneCODataProbeOptions = {
  expectJson?: boolean;
  requestKind?: string;
};

export type OneCODataSafeDiagnostic = {
  failedStage: string;
  receivedContentType: string | null;
  requestKind: string;
  resourceName: string;
  queryParameterNames: string[];
  statusCode: number;
  jsonParseFailure: boolean;
  parseErrorName: string | null;
  bodyLength: number | null;
  bomDetected: boolean;
  emptyBody: boolean;
};

const errorResponseBodies = new WeakMap<object, string | null>();

export class OneCODataResponseValidationError extends IntegrationValidationError {
  readonly failedStage = "odata_response" as const;

  constructor(
    readonly diagnostic: OneCODataSafeDiagnostic,
    responseBody: string | null = null,
  ) {
    super("1C returned an invalid OData response.");
    this.name = "OneCODataResponseValidationError";
    errorResponseBodies.set(this, responseBody);
  }

  get receivedContentType(): string | null {
    return this.diagnostic.receivedContentType;
  }
}

export class OneCODataFilterUnsupportedError extends Error {
  constructor(
    readonly diagnostic: OneCODataSafeDiagnostic,
    responseBody: string | null = null,
  ) {
    super("1C OData rejected the requested filter.");
    this.name = "OneCODataFilterUnsupportedError";
    errorResponseBodies.set(this, responseBody);
  }
}

export class OneCODataProviderError extends IntegrationODataError {
  constructor(
    readonly diagnostic: OneCODataSafeDiagnostic,
    responseBody: string | null = null,
  ) {
    super();
    this.name = "OneCODataProviderError";
    errorResponseBodies.set(this, responseBody);
  }
}

export class OneCODataHttpError extends IntegrationHttpError {
  constructor(
    readonly diagnostic: OneCODataSafeDiagnostic,
    responseBody: string | null = null,
  ) {
    super();
    this.name = "OneCODataHttpError";
    errorResponseBodies.set(this, responseBody);
  }
}

export class OneCODataClient {
  constructor(private readonly config: OneCODataClientConfig) {}

  async get(
    resource: string,
    params: Record<string, string> = {},
    options: OneCODataProbeOptions = {},
  ): Promise<unknown> {
    const result = await this.probe(resource, params, options);
    const requestDiagnostic = toSafeDiagnostic(result, result.requestKind);
    const responseBody = probeResponseBodies.get(result) ?? null;

    if (result.statusCode === 400) {
      if (isODataErrorEnvelope(result.payload)) {
        throw new OneCODataProviderError(requestDiagnostic, responseBody);
      }
      throw new OneCODataFilterUnsupportedError(requestDiagnostic, responseBody);
    }

    if (result.statusCode === 401) {
      throw new IntegrationUnauthorizedError();
    }

    if (result.statusCode === 403) {
      throw new IntegrationForbiddenError();
    }

    if (result.statusCode < 200 || result.statusCode >= 300) {
      if (isODataErrorEnvelope(result.payload)) {
        throw new OneCODataProviderError(requestDiagnostic, responseBody);
      }
      throw new OneCODataHttpError(requestDiagnostic, responseBody);
    }

    if (!result.jsonParsed) {
      throw new OneCODataResponseValidationError(toSafeDiagnostic(result), responseBody);
    }

    return result.payload;
  }

  async probe(
    resource: string,
    params: Record<string, string> = {},
    options: OneCODataProbeOptions = {},
  ): Promise<OneCODataProbeResult> {
    const { baseUrl, username, password } = this.config;
    if (!baseUrl || !username || !password) {
      throw new IntegrationProviderUnavailableError("1C OData is not configured.");
    }

    const url = new URL(`${baseUrl.replace(/\/$/, "")}/${resource.replace(/^\//, "")}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set("$format", "json");
    const requestKind = options.requestKind ?? "collection";
    const queryParameterNames = [...new Set([...url.searchParams.keys()])];

    let response: Response;
    const startedAt = performance.now();
    try {
      response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`,
        },
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new IntegrationTimeoutError("1C OData request timed out.");
      }
      throw new IntegrationProviderUnavailableError("1C OData is unavailable.");
    }

    const contentType = response.headers?.get?.("content-type") ?? null;
    const expectJson = options.expectJson !== false;

    if (!expectJson) {
      return {
        statusCode: response.status,
        contentType,
        durationMs: Math.round(performance.now() - startedAt),
        hostname: url.hostname,
        requestKind,
        resourceName: resource,
        queryParameterNames,
        jsonParsed: false,
        parseErrorName: null,
        bodyLength: null,
        bomDetected: false,
        emptyBody: false,
        payload: null,
      };
    }

    const body = await parseJsonBody(response);
    const { responseBody, ...parsedBody } = body;
    const result: OneCODataProbeResult = {
      statusCode: response.status,
      contentType,
      durationMs: Math.round(performance.now() - startedAt),
      hostname: url.hostname,
      requestKind,
      resourceName: resource,
      queryParameterNames,
      ...parsedBody,
    };
    probeResponseBodies.set(result, responseBody);

    if (
      response.status >= 200 &&
      response.status < 300 &&
      isExplicitlyNonJsonContentType(contentType)
    ) {
      throw new OneCODataResponseValidationError(toSafeDiagnostic(result), responseBody);
    }

    return result;
  }
}

async function parseJsonBody(response: Response): Promise<Pick<
  OneCODataProbeResult,
  "jsonParsed" | "parseErrorName" | "bodyLength" | "bomDetected" | "emptyBody" | "payload"
> & { responseBody: string | null }> {
  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch (error) {
    return {
      jsonParsed: false,
      parseErrorName: safeErrorName(error),
      bodyLength: null,
      bomDetected: false,
      emptyBody: false,
      payload: null,
      responseBody: null,
    };
  }

  const bomDetected = bodyText.charCodeAt(0) === 0xfeff;
  const normalizedBody = bomDetected ? bodyText.slice(1) : bodyText;
  const emptyBody = normalizedBody.trim().length === 0;
  const bodyLength = new TextEncoder().encode(bodyText).byteLength;

  if (emptyBody) {
    return {
      jsonParsed: false,
      parseErrorName: null,
      bodyLength,
      bomDetected,
      emptyBody,
      payload: null,
      responseBody: bodyText,
    };
  }

  try {
    return {
      jsonParsed: true,
      parseErrorName: null,
      bodyLength,
      bomDetected,
      emptyBody,
      payload: JSON.parse(normalizedBody),
      responseBody: bodyText,
    };
  } catch (error) {
    return {
      jsonParsed: false,
      parseErrorName: safeErrorName(error),
      bodyLength,
      bomDetected,
      emptyBody,
      payload: null,
      responseBody: bodyText,
    };
  }
}

const probeResponseBodies = new WeakMap<OneCODataProbeResult, string | null>();

export function getOneCODataErrorResponseBody(error: unknown): string | null {
  let current: unknown = error;
  const visited = new Set<unknown>();

  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const responseBody = errorResponseBodies.get(current);
    if (typeof responseBody === "string") return responseBody;
    current = "cause" in current ? current.cause : null;
  }

  return null;
}

function toSafeDiagnostic(
  result: OneCODataProbeResult,
  failedStage = "odata_response",
): OneCODataSafeDiagnostic {
  return {
    failedStage,
    receivedContentType: result.contentType,
    requestKind: result.requestKind,
    resourceName: result.resourceName,
    queryParameterNames: result.queryParameterNames,
    statusCode: result.statusCode,
    jsonParseFailure: !result.jsonParsed,
    parseErrorName: result.parseErrorName,
    bodyLength: result.bodyLength,
    bomDetected: result.bomDetected,
    emptyBody: result.emptyBody,
  };
}

function safeErrorName(error: unknown): string {
  if (error && typeof error === "object" && "name" in error && typeof error.name === "string") {
    return error.name;
  }
  return typeof error;
}

function isODataErrorEnvelope(value: unknown): boolean {
  return typeof value === "object" && value !== null &&
    ("error" in value || "odata.error" in value);
}

function isExplicitlyNonJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType === "application/atom+xml" ||
    mediaType === "application/xml" ||
    mediaType === "text/xml" ||
    mediaType === "text/html";
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
