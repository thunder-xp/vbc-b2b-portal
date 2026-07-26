import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const guardedPages = [
  "app/(admin)/admin/partner-requests/page.tsx",
  "app/(admin)/admin/partner-requests/[requestId]/page.tsx",
  "app/(admin)/admin/company-users/page.tsx",
  "app/(admin)/admin/commercial-rates/page.tsx",
  "app/(admin)/admin/integrations/catalog-sync/page.tsx",
  "app/(admin)/admin/integrations/1c-health/page.tsx",
  "app/(admin)/admin/specifications/page.tsx",
  "app/(admin)/admin/specifications/[id]/page.tsx",
  "app/(admin)/admin/reservation-requests/page.tsx",
  "app/(admin)/admin/reservation-requests/[id]/page.tsx",
  "app/(admin)/admin/companies/page.tsx",
  "app/(admin)/admin/companies/[companyId]/page.tsx",
  "app/(admin)/admin/users/page.tsx",
  "app/(admin)/admin/users/[userId]/history/page.tsx",
  "app/(admin)/admin/invitations/page.tsx",
  "app/(admin)/admin/access/page.tsx",
];

describe("admin Slice 1 security boundaries", () => {
  it.each(guardedPages)("%s uses a route-specific permission guard", (path) => {
    expect(source(path)).toContain("requireAdminPagePermission(");
  });

  it("does not use broad internal classifications on migrated routes", () => {
    const migratedSource = guardedPages.map(source).join("\n");
    expect(migratedSource).not.toMatch(
      /user_type|userType|canApprovePartnerRequests/,
    );
  });

  it("keeps the workspace request scoped and outside public caches", () => {
    const workspace = source(
      "src/modules/admin/services/admin-workspace.service.ts",
    );
    const layout = source("app/(admin)/admin/layout.tsx");

    expect(workspace).toContain("cache(");
    expect(layout).toContain("await connection()");
    expect(`${workspace}\n${layout}`).not.toMatch(
      /unstable_cache|use cache|revalidate/,
    );
  });

  it("does not serialize service-role or provider credentials into admin UI", () => {
    const adminClientSources = [
      source("src/modules/admin/components/AdminShell.tsx"),
      source("src/modules/admin/components/AdminDashboardView.tsx"),
      source("src/modules/integration/components/OneCHealthPanel.tsx"),
    ].join("\n");

    expect(adminClientSources).not.toMatch(
      /SUPABASE_SERVICE_ROLE_KEY|ONEC_PASSWORD|Authorization/,
    );
  });

  it("keeps internal role and diagnostic records free of direct writes", () => {
    const migrations = [
      source(
        "supabase/migrations/20260726150000_unified_admin_control_center_slice1.sql",
      ),
      source(
        "supabase/migrations/20260726153000_admin_diagnostic_audit.sql",
      ),
      source(
        "supabase/migrations/20260726164000_admin_access_mutations.sql",
      ),
      source(
        "supabase/migrations/20260726165000_admin_context_history.sql",
      ),
    ].join("\n");

    expect(migrations).toContain(
      "revoke all on table public.internal_user_role_assignments",
    );
    expect(migrations).toContain(
      "revoke all on table public.internal_diagnostic_audit_events",
    );
    expect(migrations).not.toMatch(
      /grant\s+(insert|update|delete)\s+on table public\.(internal_user_role_assignments|internal_diagnostic_audit_events)\s+to authenticated/i,
    );
  });

  it("keeps access inspection read-only and forbids impersonation routes", () => {
    const inspector = source(
      "src/modules/admin/components/AdminAccessInspector.tsx",
    );
    const routes = guardedPages.join("\n");
    expect(inspector).not.toMatch(/signInAs|impersonat|auth\.admin/i);
    expect(routes).not.toMatch(/impersonat/);
  });
});
