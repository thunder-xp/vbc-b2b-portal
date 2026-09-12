import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const action = read("src/modules/notifications/actions/moldcell-sandbox.actions.ts");
const provider = read("src/modules/notifications/gateway/moldcell-sms.provider.ts");
const transport = read("src/modules/notifications/gateway/moldcell.transport.ts");
const relay = read("src/modules/notifications/relay/moldcell-relay.service.ts");
const relayRoute = read("app/internal/omnichannel/v1/sms/moldcell/route.ts");
const panel = read("src/modules/notifications/components/MoldcellSandboxTestPanel.tsx");

describe("Moldcell SMS security boundaries", () => {
  it("requires separate internal view/manage permissions", () => {
    expect(action).toContain('requireAdminPermission("admin.integrations.view")');
    expect(action).toContain('requireAdminPermission("admin.integrations.manage")');
  });

  it("keeps transport and secrets in server-only code", () => {
    expect(provider.startsWith('import "server-only"')).toBe(true);
    expect(transport.startsWith('import "server-only"')).toBe(true);
    expect(relay.startsWith('import "server-only"')).toBe(true);
    expect(panel).not.toMatch(/MOLDCELL_GUID|MOLDCELL_RELAY_AUTH_SECRET|MOLDCELL_PROVIDER_ID/);
    expect(action).not.toMatch(/MOLDCELL_GUID|MOLDCELL_RELAY_AUTH_SECRET|MOLDCELL_PROVIDER_ID/);
  });

  it("exposes only the additive authenticated relay contract", () => {
    expect(relayRoute).toContain("createMoldcellRelayHandler");
    expect(relayRoute).toContain('MOLDCELL_RELAY_SINGLE_INSTANCE !== "CONFIRMED"');
    expect(relay).toContain("timingSafeEqual");
    expect(relay).toContain('Object.keys(record).sort().join(",")');
    expect(relay).not.toContain("/notification/moldcell-send/");
  });

  it("accepts only an opaque allowlist token rather than a browser phone number", () => {
    expect(action).toContain("recipientToken");
    expect(action).not.toMatch(/formData\.get\(["']phone["']\)/);
    expect(panel).not.toContain('name="phone"');
  });
});

function read(file: string): string {
  return readFileSync(resolve(file), "utf8");
}
