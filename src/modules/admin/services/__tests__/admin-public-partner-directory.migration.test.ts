import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260814201409_admin_public_partner_directory_governance.sql"), "utf8");

describe("admin public partner-directory migration", () => {
  it("keeps canonical company identity and adds only governed presentation fields", () => {
    expect(sql).toContain("alter table public.partner_companies");
    expect(sql).toContain("public_display_name text null");
    expect(sql).toContain("public_directory_revision bigint not null default 1");
    expect(sql).not.toMatch(/create table public\.public_partner_companies/i);
  });

  it("enforces explicit permission, optimistic locking, and immutable audit", () => {
    expect(sql).toContain("public.has_internal_permission('admin.catalog.manage')");
    expect(sql).toContain("PUBLIC_PARTNER_DIRECTORY_CONFLICT");
    expect(sql).toContain("errcode = 'PT409'");
    expect(sql).toContain("public_partner_directory_governance_events");
    expect(sql).toContain("prevent_public_partner_directory_event_mutation");
    expect(sql).toContain("public_directory_enabled");
    expect(sql).toContain("public_directory_disabled");
    expect(sql).toContain("public_display_name_changed");
    expect(sql).toContain("public_logo_changed");
  });

  it("keeps raw company tables private and the public RPC strictly redacted", () => {
    const publicFunction = sql.match(/create or replace function public\.list_public_partner_directory\(\)[\s\S]*?\$\$;/)?.[0] ?? "";
    expect(publicFunction).toContain("'displayName'");
    expect(publicFunction).toContain("'logoAssetPath'");
    expect(publicFunction).not.toMatch(/external_1c|fiscal|contract|debt|companyId|price/i);
    expect(sql).toContain("grant execute on function public.list_public_partner_directory() to anon");
    expect(sql).not.toMatch(/grant\s+(select|update|insert|delete)[\s\S]*partner_companies[\s\S]*to anon/i);
  });

  it("publishes only active, explicitly named and visible records", () => {
    expect(sql).toContain("public_directory_visible = true");
    expect(sql).toContain("public_display_name is not null");
    expect(sql).toContain("status = 'active'");
    expect(sql).not.toMatch(/update public\.partner_companies[\s\S]*public_directory_visible\s*=\s*true/i);
  });
});
