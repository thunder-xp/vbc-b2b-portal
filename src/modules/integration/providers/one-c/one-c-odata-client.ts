import {
  IntegrationProviderUnavailableError,
  IntegrationTimeoutError,
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
      throw new OneCODataFilterUnsupportedError();
    }

    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw new IntegrationProviderUnavailableError("1C OData request failed.");
    }

    if (!result.jsonParsed) {
      throw new IntegrationValidationError("1C returned invalid JSON.");
    }

    return result.payload;
  }

  async probe(
    resource: string,
    params: Record<string, string> = {},
  ): Promise<OneCODataProbeResult> {
    const { baseUrl, username, password } = this.config;
    if (!baseUrl || !username || !password) {
      throw new IntegrationProviderUnavailableError("1C OData is not configured.");
    }

    const url = new URL(`${baseUrl.replace(/\/$/, "")}/${resource.replace(/^\//, "")}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

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

    try {
      return {
        statusCode: response.status,
        contentType: response.headers?.get?.("content-type") ?? null,
        durationMs: Math.round(performance.now() - startedAt),
        hostname: url.hostname,
        jsonParsed: true,
        payload: await response.json(),
      };
    } catch {
      return {
        statusCode: response.status,
        contentType: response.headers?.get?.("content-type") ?? null,
        durationMs: Math.round(performance.now() - startedAt),
        hostname: url.hostname,
        jsonParsed: false,
        payload: null,
      };
    }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
