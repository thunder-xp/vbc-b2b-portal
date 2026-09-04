import fs from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { authorizeCronRequest } from "../cron-auth";

const scheduledRoutes = [
  "app/api/cron/active-order-refresh/route.ts",
  "app/api/cron/commercial-rate/route.ts",
  "app/api/cron/finance-contract-balances/route.ts",
  "app/api/cron/order-history-integrity/route.ts",
  "app/api/cron/order-history-refresh/route.ts",
  "app/api/cron/partner-notification-deadlines/route.ts",
  "app/api/cron/price-coverage/route.ts",
  "app/api/cron/price-sync-resume/route.ts",
  "app/api/cron/price-sync-start/route.ts",
  "app/api/cron/stock-sync-resume/route.ts",
  "app/api/cron/stock-sync-start/route.ts",
  "app/api/internal/catalog-sync/route.ts",
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("canonical cron authorization", () => {
  it("accepts only the configured bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    await expect(authorizeCronRequest(request("Bearer cron-secret")))
      .resolves.toMatchObject({ authorized: true, category: "authorized" });
  });

  it.each([
    [undefined, "missing_bearer"],
    ["cron-secret", "missing_bearer"],
    ["Bearer wrong", "invalid_bearer"],
  ])("denies an invalid authorization shape", async (header, category) => {
    vi.stubEnv("CRON_SECRET", "cron-secret");
    await expect(authorizeCronRequest(request(header))).resolves.toMatchObject({
      authorized: false,
      category,
    });
  });

  it("fails closed when the deployment has no canonical secret", async () => {
    vi.stubEnv("CRON_SECRET", "");
    await expect(authorizeCronRequest(request("Bearer any"))).resolves
      .toMatchObject({
        authorized: false,
        category: "missing_configuration",
      });
  });

  it("does not log the supplied or expected secret", async () => {
    vi.stubEnv("CRON_SECRET", "expected-private-secret");
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    await authorizeCronRequest(request("Bearer supplied-private-secret"));
    expect(JSON.stringify(info.mock.calls)).not.toContain("private-secret");
  });

  it("is used by every Vercel-scheduled route", () => {
    for (const relativePath of scheduledRoutes) {
      const source = fs.readFileSync(
        path.join(process.cwd(), relativePath),
        "utf8",
      );
      expect(source, relativePath).toContain("authorizeCronRequest(request)");
      expect(source, relativePath).not.toContain("timingSafeEqual");
    }
  });

  it("keeps cron credentials out of browser code", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/cron-auth.ts"),
      "utf8",
    );
    expect(source).not.toContain("NEXT_PUBLIC_CRON");
    const logPayloads = [...source.matchAll(
      /console\.(?:info|error)\(\{([\s\S]*?)\}\);/g,
    )].map((match) => match[1]);
    for (const payload of logPayloads) {
      expect(payload).not.toMatch(/\b(expected|bearer|authorization|key)\b/);
    }
  });
});

function request(authorization?: string): Request {
  return new Request("https://portal.example/api/cron/test", {
    headers: authorization ? { authorization } : {},
  });
}
