import "server-only";

import { createHash, createHmac, randomUUID } from "node:crypto";

import { NotificationDeliveryError } from "./types";

export type MoldcellTransportMode = "DIRECT" | "RELAY";

export type MoldcellProviderHttpRequest = Readonly<{ url: URL; init: RequestInit }>;

export type MoldcellTransportInput = Readonly<{
  deliveryId: string;
  recipient: string;
  message: string;
  idempotencyKey: string;
  timestamp: number;
  providerHttpRequest: MoldcellProviderHttpRequest | null;
}>;

export type MoldcellTransportResponse = Readonly<{ ok: boolean; status: number; body: string }>;

export interface MoldcellTransport {
  readonly mode: MoldcellTransportMode;
  send(input: MoldcellTransportInput): Promise<MoldcellTransportResponse>;
}

type FetchLike = typeof fetch;

export class DirectMoldcellTransport implements MoldcellTransport {
  readonly mode = "DIRECT" as const;

  constructor(private readonly timeoutMs: number, private readonly fetchImplementation: FetchLike = fetch) {}

  send(input: MoldcellTransportInput): Promise<MoldcellTransportResponse> {
    if (!input.providerHttpRequest) throw new NotificationDeliveryError("configuration", false);
    return boundedFetch(input.providerHttpRequest.url, input.providerHttpRequest.init, this.timeoutMs, this.fetchImplementation);
  }
}

export class RelayMoldcellTransport implements MoldcellTransport {
  readonly mode = "RELAY" as const;

  constructor(
    private readonly relayUrl: string,
    private readonly keyId: string,
    private readonly secret: string,
    private readonly timeoutMs: number,
    private readonly fetchImplementation: FetchLike = fetch,
  ) {}

  send(input: MoldcellTransportInput): Promise<MoldcellTransportResponse> {
    const nonce = randomUUID();
    const body = JSON.stringify({
      deliveryId: input.deliveryId,
      recipient: input.recipient,
      message: input.message,
      idempotencyKey: input.idempotencyKey,
      timestamp: input.timestamp,
    });
    const bodyHash = createHash("sha256").update(body).digest("hex");
    const signature = createHmac("sha256", this.secret)
      .update([String(input.timestamp), nonce, bodyHash, input.idempotencyKey].join("\n"))
      .digest("hex");
    return boundedFetch(this.relayUrl, {
      method: "POST",
      cache: "no-store",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
        "X-Correlation-Id": input.deliveryId,
        "X-NSD-Key-Id": this.keyId,
        "X-NSD-Timestamp": String(input.timestamp),
        "X-NSD-Nonce": nonce,
        "X-NSD-Signature": `sha256=${signature}`,
      },
      body,
    }, this.timeoutMs, this.fetchImplementation);
  }
}

async function boundedFetch(
  input: URL | string,
  init: RequestInit,
  timeoutMs: number,
  fetchImplementation: FetchLike,
): Promise<MoldcellTransportResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImplementation(input, { ...init, signal: controller.signal });
    return { ok: response.ok, status: response.status, body: (await response.text()).slice(0, 65_536) };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new NotificationDeliveryError("timeout", true);
    }
    throw new NotificationDeliveryError("network", true);
  } finally {
    clearTimeout(timeout);
  }
}
