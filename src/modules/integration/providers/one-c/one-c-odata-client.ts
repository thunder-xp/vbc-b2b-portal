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

export class OneCODataFilterUnsupportedError extends Error {
  constructor() {
    super("1C OData rejected the requested filter.");
    this.name = "OneCODataFilterUnsupportedError";
  }
}

export class OneCODataClient {
  constructor(private readonly config: OneCODataClientConfig) {}

  async get(resource: string, params: Record<string, string> = {}): Promise<unknown> {
    const { baseUrl, username, password } = this.config;
    if (!baseUrl || !username || !password) {
      throw new IntegrationProviderUnavailableError("1C OData is not configured.");
    }

    const url = new URL(`${baseUrl.replace(/\/$/, "")}/${resource.replace(/^\//, "")}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

    let response: Response;
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

    if (response.status === 400) {
      throw new OneCODataFilterUnsupportedError();
    }

    if (!response.ok) {
      throw new IntegrationProviderUnavailableError("1C OData request failed.");
    }

    try {
      return await response.json();
    } catch {
      throw new IntegrationValidationError("1C returned invalid JSON.");
    }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
