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
  retryAfterMs?: number | null;
  upstreamConnectTimeMs?: number | null;
  upstreamHeaderTimeMs?: number | null;
  upstreamResponseTimeMs?: number | null;
  responseServer?: string | null;
  safeErrorSummary?: string | null;
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
  retryAfterMs?: number | null;
  upstreamConnectTimeMs?: number | null;
  upstreamHeaderTimeMs?: number | null;
  upstreamResponseTimeMs?: number | null;
  responseServer?: string | null;
  safeErrorSummary?: string | null;
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
    return this.readResult(await this.probe(resource, params, options));
  }

  async getLiteral(
    resource: string,
    literalQuery: string,
    options: OneCODataProbeOptions = {},
  ): Promise<unknown> {
    const { baseUrl, username, password } = this.config;
    if (!baseUrl || !username || !password) {
      throw new IntegrationProviderUnavailableError("1C OData is not configured.");
    }
    if (!/^\$select=[^&#\r\n]+&\$top=\d+&\$skip=\d+&\$format=json$/.test(literalQuery)) {
      throw new IntegrationValidationError("1C literal OData query is invalid.");
    }
    const requestKind = options.requestKind ?? "collection";
    const queryParameterNames = [...literalQuery.matchAll(/(?:^|&)(\$[A-Za-z]+)=/g)]
      .map((match) => match[1]);
    const exactUrl = `${baseUrl.replace(/\/$/, "")}/${resource.replace(/^\//, "")}?${literalQuery}`;
    return this.readResult(await this.probeRequest(
      exactUrl,
      requestKind,
      resource,
      queryParameterNames,
      options,
    ));
  }

  async getLiteralDateRange(
    resource: string,
    input: { startDate: string; endDate: string; select: string; top: number; skip: number },
    options: OneCODataProbeOptions = {},
  ): Promise<unknown> {
    const { baseUrl, username, password } = this.config;
    if (!baseUrl || !username || !password) throw new IntegrationProviderUnavailableError("1C OData is not configured.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)
      || !/^[A-Za-zА-Яа-яЁё0-9_,]+$/u.test(input.select)
      || !Number.isSafeInteger(input.top) || input.top < 1 || input.top > 100
      || !Number.isSafeInteger(input.skip) || input.skip < 0) {
      throw new IntegrationValidationError("1C literal date-range query is invalid.");
    }
    const literalQuery = `$filter=Date ge datetime'${input.startDate}T00:00:00' and Date le datetime'${input.endDate}T23:59:59'&$select=${input.select}&$top=${input.top}&$skip=${input.skip}&$format=json`;
    const exactUrl = `${baseUrl.replace(/\/$/, "")}/${resource.replace(/^\//, "")}?${literalQuery}`;
    return this.readResult(await this.probeRequest(
      exactUrl,
      options.requestKind ?? "collection",
      resource,
      ["$filter", "$select", "$top", "$skip", "$format"],
      options,
    ));
  }

  async getLiteralGuidBatch(
    resource: string,
    input: { refs: string[]; select: string },
    options: OneCODataProbeOptions = {},
  ): Promise<unknown> {
    const { baseUrl, username, password } = this.config;
    if (!baseUrl || !username || !password) throw new IntegrationProviderUnavailableError("1C OData is not configured.");
    const refs = [...new Set(input.refs.map((ref) => ref.toLowerCase()))];
    if (!refs.length || refs.length > 20
      || refs.some((ref) => !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(ref) || ref === "00000000-0000-0000-0000-000000000000")
      || !/^[A-Za-zА-Яа-яЁё0-9_,]+$/u.test(input.select)) {
      throw new IntegrationValidationError("1C GUID batch query is invalid.");
    }
    const filter = refs.map((ref) => `Ref_Key eq guid'${ref}'`).join(" or ");
    const literalQuery = `$filter=${filter}&$select=${input.select}&$top=${refs.length}&$format=json`;
    const exactUrl = `${baseUrl.replace(/\/$/, "")}/${resource.replace(/^\//, "")}?${literalQuery}`;
    return this.readResult(await this.probeRequest(
      exactUrl,
      options.requestKind ?? "collection",
      resource,
      ["$filter", "$select", "$top", "$format"],
      options,
    ));
  }

  private readResult(result: OneCODataProbeResult): unknown {
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

    return this.probeRequest(url, requestKind, resource, queryParameterNames, options);
  }

  private async probeRequest(
    url: string | URL,
    requestKind: string,
    resource: string,
    queryParameterNames: string[],
    options: OneCODataProbeOptions,
  ): Promise<OneCODataProbeResult> {
    const { username, password } = this.config;

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
        throw Object.assign(new IntegrationTimeoutError("1C OData request timed out."), { cause: error });
      }
      throw Object.assign(new IntegrationProviderUnavailableError("1C OData is unavailable."), { cause: error, networkCode: safeNetworkCode(error) });
    }

    const contentType = response.headers?.get?.("content-type") ?? null;
    const expectJson = options.expectJson !== false;

    if (!expectJson) {
      return {
        statusCode: response.status,
        contentType,
        durationMs: Math.round(performance.now() - startedAt),
        hostname: new URL(url).hostname,
        requestKind,
        resourceName: resource,
        queryParameterNames,
        jsonParsed: false,
        parseErrorName: null,
        bodyLength: null,
        bomDetected: false,
        emptyBody: false,
        payload: null,
        ...responseMetadata(response, null),
      };
    }

    const body = await parseJsonBody(response);
    const { responseBody, ...parsedBody } = body;
    const result: OneCODataProbeResult = {
      statusCode: response.status,
      contentType,
      durationMs: Math.round(performance.now() - startedAt),
      hostname: new URL(url).hostname,
      requestKind,
      resourceName: resource,
      queryParameterNames,
      ...parsedBody,
      ...responseMetadata(response, parsedBody.payload),
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
    retryAfterMs: result.retryAfterMs ?? null,
    upstreamConnectTimeMs: result.upstreamConnectTimeMs ?? null,
    upstreamHeaderTimeMs: result.upstreamHeaderTimeMs ?? null,
    upstreamResponseTimeMs: result.upstreamResponseTimeMs ?? null,
    responseServer: result.responseServer ?? null,
    safeErrorSummary: result.safeErrorSummary ?? null,
  };
}

function responseMetadata(response: Response, payload: unknown) {
  return {
    retryAfterMs: parseRetryAfter(response.headers?.get?.("retry-after") ?? null),
    upstreamConnectTimeMs: parseTimingHeader(response.headers?.get?.("x-upstream-connect-time") ?? null),
    upstreamHeaderTimeMs: parseTimingHeader(response.headers?.get?.("x-upstream-header-time") ?? null),
    upstreamResponseTimeMs: parseTimingHeader(response.headers?.get?.("x-upstream-response-time") ?? null),
    responseServer: safeHeaderToken(response.headers?.get?.("server") ?? null),
    safeErrorSummary: safeODataErrorSummary(payload),
  };
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(Math.round(seconds * 1000), 30_000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, Math.min(timestamp - Date.now(), 30_000)) : null;
}

function parseTimingHeader(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value.split(",", 1)[0]?.trim());
  return Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds * 1000) : null;
}

function safeHeaderToken(value: string | null): string | null { return value?.trim().replace(/[^a-z0-9._/-]/gi, "").slice(0, 80) || null; }

function safeODataErrorSummary(payload: unknown): string | null {
  if (!isRecord(payload) || !isODataErrorEnvelope(payload)) return null;
  const envelope = isRecord(payload.error) ? payload.error : isRecord(payload["odata.error"]) ? payload["odata.error"] : null;
  if (!envelope) return "odata_error";
  const messageValue = isRecord(envelope.message) ? envelope.message.value : envelope.message;
  const message = typeof messageValue === "string" ? messageValue : "odata_error";
  return message.trim().replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[redacted]").replace(/'[^']*'/g, "'[redacted]'").slice(0, 180);
}

function safeNetworkCode(error: unknown): string | null {
  let current: unknown = error;
  const visited = new Set<object>();
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if ("code" in current && typeof current.code === "string") return current.code.slice(0, 40);
    current = "cause" in current ? current.cause : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }

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
