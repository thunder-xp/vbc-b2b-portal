import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Partner Access Risk Radar runtime wiring", () => {
  it("uses detached bounded telemetry and no browser Supabase client", () => {
    const client = read("src/modules/access-risk/client/access-risk-telemetry.ts");
    const route = read("app/api/internal/access-risk/telemetry/route.ts");
    expect(client).toContain("const MAX_BATCH = 20");
    expect(client).toContain("keepalive: true");
    expect(client).toContain("navigator.sendBeacon");
    expect(client).not.toContain("supabase");
    expect(route).toContain("supabase.auth.getClaims()");
    expect(route).toContain("DROPPED_FAIL_OPEN");
    expect(route).not.toMatch(/companyId\s*=\s*body/);
  });

  it("runs evaluation behind canonical cron authorization", () => {
    const route = read("app/api/cron/access-risk/route.ts");
    const vercel = JSON.parse(read("vercel.json")) as { crons: Array<{ path: string; schedule: string }> };
    expect(route).toContain("authorizeCronRequest");
    expect(route).toContain("evaluate(1000)");
    expect(vercel.crons).toContainEqual({ path: "/api/cron/access-risk", schedule: "12 * * * *" });
  });

  it("normalizes empty optional overview filters before the guarded RPC", () => {
    const repository = read("src/modules/access-risk/repositories/supabase/access-risk.supabase-repository.ts");
    expect(repository).toContain("p_risk_state: input.riskState || null");
    expect(repository).toContain("p_mode: input.mode || null");
  });

  it("adds Admin-only routes without any automated access mutation", () => {
    const overview = read("app/(admin)/admin/security/access-risk/page.tsx");
    const detail = read("app/(admin)/admin/security/access-risk/[companyId]/page.tsx");
    const component = read("src/modules/access-risk/components/AccessRiskCompanyView.tsx");
    const overviewComponent = read("src/modules/access-risk/components/AccessRiskOverviewView.tsx");
    expect(overview).toContain('requireAdminPagePermission("admin.security.view")');
    expect(detail).toContain('workspace.permissions.includes("admin.security.manage")');
    expect(component).toContain('href="/admin/security"');
    expect(component).not.toMatch(/revokeAccess|blockAccess|suspendAccess|requireMfa/i);
    expect(overviewComponent).toContain("xl:grid-cols-[minmax(220px,1fr)_170px_170px_180px_auto]");
    expect(overviewComponent).not.toContain("md:grid-cols-[minmax(220px,1fr)_170px_170px_180px_auto]");
  });
});
