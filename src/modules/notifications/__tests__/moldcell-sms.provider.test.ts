import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  MoldcellSmsProvider,
  moldcellConfigurationFromEnvironment,
  summarizeMoldcellConfiguration,
  type MoldcellSmsConfiguration,
} from "../gateway";
import { normalizeE164Phone, toMoldcellRecipient } from "../gateway/sms-phone";

describe("MoldcellSmsProvider", () => {
  it("uses strict E.164 internally and removes plus only at the provider boundary", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ resultCode: "0", resultCount: "1" }));
    const provider = new MoldcellSmsProvider(directConfiguration(), fetcher);

    await expect(provider.send(message())).resolves.toMatchObject({
      provider: "moldcell",
      providerStatus: "PROVIDER_ACCEPTED",
      providerCode: "0",
    });
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.pathname).toBe("/rest/provider/customer/sendSMS");
    expect(url.searchParams.get("to")).toBe("99912345678");
    expect(url.searchParams.get("from")).toBe("NSD");
    expect(url.searchParams.get("template")).toBe("NSD_NOTIFICATION");
    expect(url.searchParams.get("customText")).toBe("NSD TEST: hello");
    expect(url.searchParams.has("clientReference")).toBe(false);
    expect(normalizeE164Phone("99912345678")).toBeNull();
    expect(toMoldcellRecipient("+99912345678")).toBe("99912345678");
  });

  it("normalizes the legacy double-encoded response without claiming delivery", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(
      JSON.stringify(JSON.stringify({ resultCode: 0, resultDate: "12.09.2026 20:55:38", resultMessage: "" })),
      { status: 200 },
    ));
    await expect(new MoldcellSmsProvider(directConfiguration(), fetcher).send(message())).resolves.toMatchObject({
      providerStatus: "PROVIDER_ACCEPTED",
      providerCode: "0",
      providerTimestamp: "12.09.2026 20:55:38",
    });
  });

  it("fails unknown nonzero provider codes permanently unless explicitly classified", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ resultCode: "99", resultMessage: "Unknown" }));
    const provider = new MoldcellSmsProvider(directConfiguration(), fetcher);
    await expect(provider.send(message())).rejects.toMatchObject({
      category: "unknown", retryable: false, providerCode: "99",
    });
  });

  it("retries only configured provider codes and retryable HTTP/network failures", async () => {
    const retryable = new Set(["TEMP"]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ resultCode: "TEMP" }));
    const provider = new MoldcellSmsProvider({ ...directConfiguration(), retryableResultCodes: retryable }, fetcher);
    await expect(provider.send(message())).rejects.toMatchObject({ category: "unavailable", retryable: true });

    fetcher.mockResolvedValueOnce(new Response("upstream unavailable", { status: 503 }));
    await expect(provider.send(message())).rejects.toMatchObject({ category: "unavailable", retryable: true });
  });

  it("enforces bounded message input without truncating", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = new MoldcellSmsProvider({ ...directConfiguration(), maxCharacters: 10 }, fetcher);
    await expect(provider.send({ ...message(), text: "12345678901" })).rejects.toMatchObject({
      category: "invalid_message", retryable: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("bounds a hanging provider call with a retryable timeout", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const provider = new MoldcellSmsProvider({ ...directConfiguration(), timeoutMs: 5 }, fetcher);
    await expect(provider.send(message())).rejects.toMatchObject({ category: "timeout", retryable: true });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("signs secure relay requests without putting credentials in the payload", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ resultCode: "0" }));
    const config = relayConfiguration();
    await new MoldcellSmsProvider(config, fetcher).send(message());
    const init = fetcher.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    const body = String(init.body);
    const bodyHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
    const hash = Buffer.from(bodyHash).toString("hex");
    const expected = createHmac("sha256", config.relaySecret!)
      .update([headers["X-NSD-Timestamp"], headers["X-NSD-Nonce"], hash, message().idempotencyKey].join("\n"))
      .digest("hex");
    expect(headers["X-NSD-Signature"]).toBe(`sha256=${expected}`);
    expect(headers["Idempotency-Key"]).toBe(message().idempotencyKey);
    expect(body).not.toContain(config.relaySecret!);
    expect(String(fetcher.mock.calls[0]![0])).not.toContain(config.relaySecret!);
  });

  it("refuses the unauthenticated legacy browser relay path", () => {
    const configuration = moldcellConfigurationFromEnvironment({
      MOLDCELL_TRANSPORT: "SECURE_RELAY",
      MOLDCELL_RELAY_URL: "https://api.novotech.systems/notification/moldcell-send/",
      MOLDCELL_RELAY_KEY_ID: "key-1",
      MOLDCELL_RELAY_SECRET: "not-a-real-secret",
      MOLDCELL_SENDER: "NSD",
      MOLDCELL_TEMPLATE: "NSD_NOTIFICATION",
    });
    expect(summarizeMoldcellConfiguration(configuration)).toMatchObject({
      configured: false,
      transport: "UNCONFIGURED",
    });
  });
});

function response(body: object) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function message() {
  return {
    deliveryId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: "delivery-key",
    recipient: "+99912345678",
    subject: "test",
    text: "NSD TEST: hello",
    html: "",
  };
}

function directConfiguration(): MoldcellSmsConfiguration {
  return {
    transport: "DIRECT",
    baseUrl: "https://wsg.moldcell.md",
    providerId: "provider",
    customerId: "customer",
    guid: "not-a-real-guid",
    relayUrl: null,
    relayKeyId: null,
    relaySecret: null,
    sender: "NSD",
    template: "NSD_NOTIFICATION",
    timeoutMs: 1_000,
    maxCharacters: 70,
    retryableResultCodes: new Set(),
    permanentResultCodes: new Set(),
  };
}

function relayConfiguration(): MoldcellSmsConfiguration {
  return {
    ...directConfiguration(),
    transport: "SECURE_RELAY",
    baseUrl: null,
    providerId: null,
    customerId: null,
    guid: null,
    relayUrl: "https://relay.example.com/internal/moldcell/sms",
    relayKeyId: "key-1",
    relaySecret: "not-a-real-secret",
  };
}
