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
  jsonParsed: boolean;
  payload: unknown;
};

export type OneCODataProbeOptions = {
  expectJson?: boolean;
};

export class OneCODataResponseValidationError extends IntegrationValidationError {
  readonly failedStage = "odata_response" as const;

  constructor(readonly receivedContentType: string | null) {
    super("1C returned an invalid OData response.");
    this.name = "OneCODataResponseValidationError";
  }
}

export class OneCODataFilterUnsupportedError extends Error {
  constructor() {
    super("1C OData rejected the requested filter.");
    this.name = "OneCODataFilterUnsupportedError";
  }
}

export class OneCODataClient {
  constructor(private readonly config: OneCODataClientConfig) {}

  async get(resource: string, params: Record<string, string> = {}): Promise<unknown> {
    const result = await this.probe(resource, params);

    if (result.statusCode === 400) {
      if (isODataErrorEnvelope(result.payload)) {
        throw new IntegrationODataError();
      }
      throw new OneCODataFilterUnsupportedError();
    }

    if (result.statusCode === 401) {
      throw new IntegrationUnauthorizedError();
    }

    if (result.statusCode === 403) {
      throw new IntegrationForbiddenError();
    }

    if (result.statusCode < 200 || result.statusCode >= 300) {
      if (isODataErrorEnvelope(result.payload)) {
        throw new IntegrationODataError();
      }
      throw new IntegrationHttpError();
    }

    if (!result.jsonParsed) {
      throw new OneCODataResponseValidationError(result.contentType);
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

    if (
      expectJson &&
      response.status >= 200 &&
      response.status < 300 &&
      isExplicitlyNonJsonContentType(contentType)
    ) {
      throw new OneCODataResponseValidationError(contentType);
    }

    if (!expectJson) {
      return {
        statusCode: response.status,
        contentType,
        durationMs: Math.round(performance.now() - startedAt),
        hostname: url.hostname,
        jsonParsed: false,
        payload: null,
      };
    }

    try {
      return {
        statusCode: response.status,
        contentType,
        durationMs: Math.round(performance.now() - startedAt),
        hostname: url.hostname,
        jsonParsed: true,
        payload: await response.json(),
      };
    } catch {
      return {
        statusCode: response.status,
        contentType,
        durationMs: Math.round(performance.now() - startedAt),
        hostname: url.hostname,
        jsonParsed: false,
        payload: null,
      };
    }
  }
}

function isODataErrorEnvelope(value: unknown): boolean {
  return typeof value === "object" && value !== null && "error" in value;
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
