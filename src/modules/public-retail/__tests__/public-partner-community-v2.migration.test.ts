import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260920122034_public_partner_community_experience_v2.sql"), "utf8");

describe("public Partner Community V2 migration", () => {
  it("extends the existing governed company projection without a parallel Partner master", () => {
    expect(sql).toContain("alter table public.partner_companies");
    expect(sql).toContain("add column public_slug text null");
    expect(sql).toContain("add column public_description_ru text null");
    expect(sql).toContain("add column public_description_ro text null");
    expect(sql).toContain("add column public_location_label text null");
    expect(sql).not.toMatch(/create table public\.(partner_directory_profiles|public_partner_companies)/i);
  });

  it("uses one bounded child table for stable capability evidence with strict RLS", () => {
    expect(sql).toContain("create table public.public_partner_capabilities");
    expect(sql).toContain("'CCTV', 'ALARM', 'ACCESS_CONTROL', 'INTERCOM', 'NETWORK', 'OTHER'");
    expect(sql).toContain("'SELF_DECLARED', 'VERIFIED'");
    expect(sql).toContain("alter table public.public_partner_capabilities enable row level security");
    expect(sql).toContain("revoke all on table public.public_partner_capabilities from public, anon, authenticated");
    expect(sql).not.toMatch(/grant\s+(select|insert|update|delete)[\s\S]*public_partner_capabilities[\s\S]*to\s+(anon|authenticated)/i);
  });

  it("returns only published allowlisted Community data without Marketplace joins or fields", () => {
    const list = sql.match(/create function public\.list_public_partner_directory\([\s\S]*?\n\$\$;/)?.[0] ?? "";
    const detail = sql.match(/create function public\.get_public_partner_profile\([\s\S]*?\n\$\$;/)?.[0] ?? "";
    for (const fn of [list, detail]) {
      expect(fn).toContain("public_directory_visible = true");
      expect(fn).toContain("status = 'active'");
      expect(fn).not.toMatch(/installation_|providerId|ranking|review|availability|assignment/i);
    }
    expect(list).toContain("limit 100");
    expect(detail).toContain("company.public_slug = lower(btrim(p_slug))");
  });

  it("keeps Admin writes permission-gated, optimistic and field-audited", () => {
    const update = sql.match(/create function public\.update_admin_public_partner_directory\([\s\S]*?\n\$\$;/)?.[0] ?? "";
    expect(update).toContain("public.has_internal_permission('admin.catalog.manage')");
    expect(update).toContain("PUBLIC_PARTNER_DIRECTORY_CONFLICT");
    expect(update).toContain("PUBLIC_PARTNER_SLUG_CONFLICT");
    expect(update).toContain("public_capabilities_changed");
    expect(update).toContain("CAPABILITY:");
    expect(update).toContain("changed_fields");
  });

  it("does not auto-populate new public content or mutate existing publication state", () => {
    const update = sql.match(/create function public\.update_admin_public_partner_directory\([\s\S]*?\n\$\$;/)?.[0] ?? "";
    expect(sql).not.toMatch(/update\s+public\.partner_companies[\s\S]*set[\s\S]*(public_slug|public_description_ru)[\s\S]*where\s+public_directory_visible/i);
    expect(update).toContain("from jsonb_array_elements(normalized_capabilities) item");
    expect(update).not.toMatch(/installation_|marketplace/i);
  });
});
