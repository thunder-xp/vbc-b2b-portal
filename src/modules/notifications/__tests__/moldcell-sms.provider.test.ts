import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DirectMoldcellTransport,
  MoldcellSmsProvider,
  PrefixSmsProviderResolver,
  RelayMoldcellTransport,
  SmsChannelAdapter,
  createMoldcellSmsProvider,
  moldcellConfigurationFromEnvironment,
  summarizeMoldcellConfiguration,
  type MoldcellSmsConfiguration,
  type SmsProvider,
} from "../gateway";
import { normalizeE164Phone, toMoldcellRecipient } from "../gateway/sms-phone";

describe("portable SMS provider architecture", () => {
  it("resolves only +373 to Moldcell and returns a governed unsupported destination", async () => {
    const provider = { provider: "moldcell", send: vi.fn<SmsProvider["send"]>() };
    const adapter = new SmsChannelAdapter(new PrefixSmsProviderResolver([{ prefix: "+373", provider }]));
    await expect(adapter.send(notificationMessage("+40123456789"))).rejects.toMatchObject({
      category: "no_sms_provider_for_destination",
      providerCode: "NO_SMS_PROVIDER_FOR_DESTINATION",
      retryable: false,
    });
    expect(provider.send).not.toHaveBeenCalled();
  });

  it("does not break email worker construction when SMS is unconfigured", async () => {
    const adapter = new SmsChannelAdapter(new PrefixSmsProviderResolver([{
      prefix: "+373",
      provider: createMoldcellSmsProvider({}),
    }]));
    await expect(adapter.send(notificationMessage())).rejects.toMatchObject({
      category: "configuration",
      retryable: false,
    });
  });

  it("keeps the channel contract unchanged when relay is replaced by direct transport", async () => {
    const relayFetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ resultCode: "0" }));
    const directFetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ resultCode: "0" }));
    const relay = new SmsChannelAdapter(new PrefixSmsProviderResolver([{
      prefix: "+373",
      provider: createMoldcellSmsProvider(relayEnvironment(), relayFetcher),
    }]));
    const direct = new SmsChannelAdapter(new PrefixSmsProviderResolver([{
      prefix: "+373",
      provider: createMoldcellSmsProvider(directEnvironment(), directFetcher),
    }]));
    await expect(relay.send(notificationMessage())).resolves.toMatchObject({ providerStatus: "PROVIDER_ACCEPTED" });
    await expect(direct.send(notificationMessage())).resolves.toMatchObject({ providerStatus: "PROVIDER_ACCEPTED" });
    expect(relayFetcher.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(directFetcher.mock.calls[0]?.[1]?.method).toBe("GET");
  });
});

describe("MoldcellSmsProvider", () => {
  it("uses strict E.164 internally and removes plus only in the provider-owned direct request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ resultCode: "0", resultCount: "1" }));
    const config = directConfiguration();
    const provider = new MoldcellSmsProvider(config, new DirectMoldcellTransport(1_000, fetcher));

    await expect(provider.send(providerMessage())).resolves.toMatchObject({
      provider: "moldcell",
      accepted: true,
      providerCode: "0",
    });
    const url = new URL(String(fetcher.mock.calls[0]![0]));
    expect(url.pathname).toBe("/rest/provider/customer/sendSMS");
    expect(url.searchParams.get("to")).toBe("37369000000");
    expect(url.searchParams.get("from")).toBe("NSD");
    expect(url.searchParams.get("template")).toBe("NSD_NOTIFICATION");
    expect(url.searchParams.get("customText")).toBe("NSD TEST: hello");
    expect(normalizeE164Phone("069000000")).toBeNull();
    expect(normalizeE164Phone("37369000000")).toBeNull();
    expect(normalizeE164Phone("+373 69 000 000")).toBe("+37369000000");
    expect(toMoldcellRecipient("+37369000000")).toBe("37369000000");
  });

  it.each([
    ["20001", "INVALID_MSISDN"],
    ["20012", "OUTNET_NOT_ALLOWED"],
    ["99999", "UNKNOWN_PROVIDER_FAILURE"],
  ])("maps Moldcell result %s to permanent %s", async (providerCode, failureCategory) => {
    const transport = { mode: "DIRECT" as const, send: vi.fn().mockResolvedValue({
      ok: true, status: 200, body: JSON.stringify({ resultCode: providerCode }),
    }) };
    const result = await new MoldcellSmsProvider(directConfiguration(), transport).send(providerMessage());
    expect(result).toMatchObject({ accepted: false, providerCode, failureCategory, retryability: "PERMANENT" });
  });

  it("parses a provider response exactly once without claiming delivery", async () => {
    const transport = { mode: "DIRECT" as const, send: vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: JSON.stringify(JSON.stringify({ resultCode: 0, resultDate: "12.09.2026 20:55:38" })),
    }) };
    await expect(new MoldcellSmsProvider(directConfiguration(), transport).send(providerMessage())).resolves.toMatchObject({
      accepted: true,
      providerCode: "0",
      providerTimestamp: "12.09.2026 20:55:38",
    });
  });

  it("enforces bounded message input without truncating", async () => {
    const transport = { mode: "DIRECT" as const, send: vi.fn() };
    const provider = new MoldcellSmsProvider({ ...directConfiguration(), maxCharacters: 10 }, transport);
    await expect(provider.send({ ...providerMessage(), message: "12345678901" })).rejects.toMatchObject({
      category: "invalid_message", retryable: false,
    });
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("bounds a hanging direct provider call with a retryable timeout", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const provider = new MoldcellSmsProvider(directConfiguration(), new DirectMoldcellTransport(5, fetcher));
    await expect(provider.send(providerMessage())).rejects.toMatchObject({ category: "timeout", retryable: true });
  });

  it("signs the exact relay contract without sender, template, URL or credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response({ resultCode: "0" }));
    const secret = "test-only-relay-secret-at-least-32";
    const transport = new RelayMoldcellTransport(
      "https://relay.example.com/internal/omnichannel/v1/sms/moldcell",
      "key-1",
      secret,
      1_000,
      fetcher,
    );
    await new MoldcellSmsProvider(relayConfiguration(), transport).send(providerMessage());
    const init = fetcher.mock.calls[0]![1]!;
    const headers = init.headers as Record<string, string>;
    const body = String(init.body);
    const parsed = JSON.parse(body);
    const hash = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))).toString("hex");
    const expected = createHmac("sha256", secret)
      .update([headers["X-NSD-Timestamp"], headers["X-NSD-Nonce"], hash, providerMessage().idempotencyKey].join("\n"))
      .digest("hex");
    expect(Object.keys(parsed).sort()).toEqual(["deliveryId", "idempotencyKey", "message", "recipient", "timestamp"]);
    expect(headers["X-NSD-Signature"]).toBe(`sha256=${expected}`);
    expect(body).not.toContain("NSD_NOTIFICATION");
    expect(body).not.toContain(secret);
    expect(String(fetcher.mock.calls[0]![0])).not.toContain(secret);
  });

  it("uses exact external configuration names and refuses the legacy endpoint", () => {
    expect(summarizeMoldcellConfiguration(moldcellConfigurationFromEnvironment(relayEnvironment()))).toMatchObject({
      configured: true,
      transport: "RELAY",
    });
    const legacy = moldcellConfigurationFromEnvironment({
      ...relayEnvironment(),
      MOLDCELL_RELAY_URL: "https://api.novotech.systems/notification/moldcell-send/",
    });
    expect(summarizeMoldcellConfiguration(legacy)).toMatchObject({ configured: false, transport: "UNCONFIGURED" });
  });
});

function response(body: object) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function notificationMessage(recipient = "+37369000000") {
  return {
    deliveryId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: "delivery-key",
    recipient,
    subject: "test",
    text: "NSD TEST: hello",
    html: "",
    locale: "ru" as const,
  };
}

function providerMessage() {
  return {
    deliveryId: "11111111-1111-4111-8111-111111111111",
    idempotencyKey: "delivery-key",
    recipient: "+37369000000",
    message: "NSD TEST: hello",
    locale: "ru" as const,
  };
}

function directConfiguration(): MoldcellSmsConfiguration {
  return {
    transportMode: "DIRECT",
    baseUrl: "https://wsg.moldcell.md",
    providerId: "provider",
    customerId: "customer",
    guid: "not-a-real-guid-value",
    relayUrl: null,
    relayKeyId: null,
    relaySecret: null,
    sender: "NSD",
    template: "NSD_NOTIFICATION",
    timeoutMs: 1_000,
    maxCharacters: 70,
  };
}

function relayConfiguration(): MoldcellSmsConfiguration {
  return {
    ...directConfiguration(),
    transportMode: "RELAY",
    baseUrl: null,
    providerId: null,
    customerId: null,
    guid: null,
    relayUrl: "https://relay.example.com/internal/omnichannel/v1/sms/moldcell",
    relayKeyId: "key-1",
    relaySecret: "test-only-relay-secret-at-least-32",
  };
}

function relayEnvironment(): Record<string, string> {
  return {
    MOLDCELL_TRANSPORT_MODE: "relay",
    MOLDCELL_RELAY_URL: "https://relay.example.com/internal/omnichannel/v1/sms/moldcell",
    MOLDCELL_RELAY_KEY_ID: "key-1",
    MOLDCELL_RELAY_AUTH_SECRET: "test-only-relay-secret-at-least-32",
  };
}

function directEnvironment(): Record<string, string> {
  return {
    MOLDCELL_TRANSPORT_MODE: "direct",
    MOLDCELL_BASE_URL: "https://wsg.moldcell.md",
    MOLDCELL_PROVIDER_ID: "provider",
    MOLDCELL_CUSTOMER_ID: "customer",
    MOLDCELL_GUID: "test-only-provider-secret",
  };
}
