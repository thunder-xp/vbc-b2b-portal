import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20260813055501_retail_installation_marketplace_foundation.sql"), "utf8");

describe("Retail Marketplace foundation migration", () => {
  it.each([
    "installation_tariff_sets", "installation_tariffs", "installation_service_regions",
    "installation_providers", "installation_provider_profiles", "installation_provider_competencies",
    "installation_provider_regions", "internal_installation_teams", "retail_marketplace_events",
  ])("creates governed %s data", (table) => expect(sql).toContain(`create table public.${table}`));

  it("protects published tariffs and append-only events", () => {
    expect(sql).toContain("Published installation tariff versions are immutable.");
    expect(sql).toContain("Retail Marketplace events are append-only.");
    expect(sql).toContain("create unique index installation_tariff_sets_one_published_idx");
  });

  it("keeps public reads behind redacted SECURITY DEFINER projections", () => {
    expect(sql).toContain("create or replace function public.list_public_installation_providers");
    expect(sql).toContain("security definer set search_path=public");
    expect(sql).toContain("revoke all on public.installation_tariff_sets");
    expect(sql).not.toMatch(/grant select[^;]+\bto anon\b/i);
  });

  it("does not reuse B2B pricing or introduce payment and assignment domains", () => {
    expect(sql).not.toContain("partner_services");
    expect(sql).not.toContain("PaymentAttempt");
    expect(sql).not.toContain("maib");
    expect(sql).not.toContain("provider_assignment");
    expect(sql).not.toContain("installation_commission_rules");
  });

  it("seeds only a non-public Novotech internal provider", () => {
    expect(sql).toContain("'novotech-installation','Novotech Installation'");
    expect(sql).toContain("'internal_team',id,'inactive','pending',false");
    expect(sql).toContain("'draft','unavailable',120");
  });
});
