import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve("supabase/migrations/20260810130000_proposal_generator_mvp.sql"), "utf8");
const telemetrySql = readFileSync(resolve("supabase/migrations/20260810140000_proposal_generator_telemetry_completion.sql"), "utf8");
const calculatorSql = readFileSync(resolve("supabase/migrations/20260810150000_proposal_generator_quick_calculation.sql"), "utf8");
const resolutionTelemetrySql = readFileSync(resolve("supabase/migrations/20260810160000_proposal_generator_resolution_telemetry.sql"), "utf8");
const serviceMappingSql = readFileSync(resolve("supabase/migrations/20260810170000_proposal_generator_governed_service_mappings.sql"), "utf8");
const servicePriceSql = readFileSync(resolve("supabase/migrations/20260810180000_proposal_generator_service_default_prices.sql"), "utf8");
const vatIncludedSql = readFileSync(resolve("supabase/migrations/20260810190000_proposal_generator_vat_included_defaults.sql"), "utf8");
const grossVatSql = readFileSync(resolve("supabase/migrations/20260810200000_proposal_generator_gross_vat_defaults.sql"), "utf8");
const vatTotalsSql = readFileSync(resolve("supabase/migrations/20260810210000_proposal_generator_vat_totals_recalculation.sql"), "utf8");
const serviceSource = readFileSync(resolve("src/modules/estimates/services/proposal-generator.service.ts"), "utf8");
const adminPage = readFileSync(resolve("app/(admin)/admin/commercial/proposal-generator/page.tsx"), "utf8");

describe("proposal generator MVP migration", () => {
  it("creates one atomic hand-off into canonical estimates with bounded input", () => {
    expect(sql).toContain("create or replace function public.create_estimate_from_generator");
    expect(sql).toContain("public.create_estimate_v3");
    expect(sql).toContain("jsonb_array_length(generated_lines) > 30");
    expect(sql).toContain("where estimate_id = created.id and system_key = line->>'section_key'");
    expect(sql).not.toContain("Document_ЗаказПокупателя");
  });
  it("preserves governed identities, null external prices, and tenant access", () => {
    expect(sql).toContain("public.can_access_estimates(target_company_id, 'estimates.manage')");
    expect(sql).toContain("product.is_active and product.is_visible");
    expect(sql).toContain("partner_external_nomenclature_library");
    expect(sql).toContain("external_item.unit, null");
  });
  it("stores bounded metrics without raw requirement text and immutable feedback", () => {
    expect(sql).toContain("estimate_generator_sessions");
    expect(sql).toContain("estimate_generator_feedback");
    expect(sql).toContain("Generator feedback is immutable.");
    expect(sql).not.toMatch(/requirement_text|raw_requirement|prompt_text/i);
    expect(sql).toContain("admin.estimates.view");
  });
  it("revokes tables and uses explicit search paths", () => {
    expect(sql).toContain("revoke all on table public.estimate_generator_sessions, public.estimate_generator_feedback from public, anon, authenticated");
    expect(sql).toContain("security definer set search_path = public");
  });
  it("reports the complete pilot funnel without persisting raw requirements", () => {
    for (const metric of [
      "generationCompleted", "generationFailed", "generatorToEstimateConversionRate",
      "averageGenerationDurationMs", "averageGenerationToEstimateMs", "resolvedCatalogCount",
      "ownNomenclatureCount", "sharedNomenclatureCount", "unresolvedCount",
    ]) expect(telemetrySql).toContain(`'${metric}'`);
    expect(telemetrySql).not.toMatch(/requirement_text|raw_requirement|prompt_text/i);
    expect(adminPage).toContain("summary.sharedNomenclatureCount");
  });
  it("persists a bounded failed generation outcome", () => {
    expect(serviceSource).toContain("failed: true");
    expect(serviceSource).toContain("requirementCount: 0");
  });
  it("adds governed calculator mappings without raw narrative telemetry", () => {
    expect(calculatorSql).toContain("estimate_generator_calculator_profiles");
    expect(calculatorSql).toContain("target_generation_mode");
    expect(calculatorSql).toContain("quick_calculation");
    expect(calculatorSql).toContain("admin.integrations.manage");
    expect(calculatorSql).toContain("expected_version");
    expect(calculatorSql).not.toMatch(/requirement_text|raw_requirement|prompt_text/i);
  });
  it("resolves calculator mappings in one bounded RPC and preserves unresolved identities", () => {
    expect(calculatorSql).toContain("resolve_estimate_generator_calculator_profiles");
    expect(calculatorSql).toContain("profile.profile_key=any");
    expect(calculatorSql).toContain("else 'unresolved'");
    expect(calculatorSql).not.toContain("Document_ЗаказПокупателя");
  });
  it("records resolution facts before optional estimate creation", () => {
    expect(resolutionTelemetrySql).toContain("record_estimate_generator_session_v2");
    expect(resolutionTelemetrySql).toContain("total_resolution_count<>target_requirement_count");
    expect(resolutionTelemetrySql).toContain("where id=session_id and estimate_id is null");
    expect(serviceSource).toContain("resolutionCounts: countGeneratorResolutions(requirements)");
  });
  it("extends governed profiles to canonical services with compatible units", () => {
    expect(serviceMappingSql).toContain("partner_service_id");
    expect(serviceMappingSql).toContain("'service'");
    expect(serviceMappingSql).toContain("service.default_unit=profile.unit");
    expect(serviceMappingSql).toContain("company_id is null");
    expect(serviceMappingSql).toContain("resolve_generator_services");
    expect(serviceMappingSql).not.toContain("insert into public.external_nomenclature_items");
  });
  it("preserves governed mapping audit, telemetry, and atomic service insertion", () => {
    expect(serviceMappingSql).toContain("estimate_generator_calculator_profile_events");
    expect(serviceMappingSql).toContain("resolved_service_count");
    expect(serviceMappingSql).toContain("record_estimate_generator_session_v3");
    expect(serviceMappingSql).toContain("'service',service.id");
    expect(serviceMappingSql).toContain("service.default_selling_price");
  });
  it("adds calculator-scoped versioned service prices without changing canonical service pricing", () => {
    expect(servicePriceSql).toContain("default_selling_unit_price");
    expect(servicePriceSql).toContain("default_selling_currency_code");
    expect(servicePriceSql).toContain("default_selling_vat_mode");
    expect(servicePriceSql).toContain("service_price_changed");
    expect(servicePriceSql).toContain("expected_version");
    expect(servicePriceSql).toContain("admin.integrations.manage");
    expect(servicePriceSql).not.toMatch(/update public\.partner_services/i);
  });
  it("revalidates calculator service pricing during atomic estimate insertion", () => {
    expect(servicePriceSql).toContain("profile.profile_key=line->>'profile_key'");
    expect(servicePriceSql).toContain("profile.partner_service_id=service.id");
    expect(servicePriceSql).toContain("default_selling_currency_code=target_currency_code");
    expect(servicePriceSql).not.toContain("Document_ЗаказПокупателя");
  });
  it("normalizes VAT-included calculator defaults only at governed estimate creation", () => {
    expect(vatIncludedSql).toContain("create_estimate_from_generator_v2");
    expect(vatIncludedSql).toContain("target_vat_mode not in ('none', 'separate')");
    expect(vatIncludedSql).toContain("profile.default_selling_vat_mode = 'included'");
    expect(vatIncludedSql).toContain("round(profile.default_selling_unit_price / 1.20, 2)");
    expect(vatIncludedSql).toContain("profile.default_selling_currency_code = target_currency_code");
    expect(vatIncludedSql).toContain("existing_estimate_id is not null");
    expect(vatIncludedSql).not.toMatch(/update public\.partner_services/i);
  });
  it("preserves the approved gross unit price in VAT-included proposals", () => {
    expect(grossVatSql).toContain("create_estimate_from_generator_v3");
    expect(grossVatSql).toContain("target_vat_mode not in ('none', 'included')");
    expect(grossVatSql).toContain("public.create_estimate_from_generator_v2(");
    expect(grossVatSql).toContain("vat_rate_percent = case when target_vat_mode = 'included' then 20 else 0 end");
    expect(grossVatSql).not.toContain("default_selling_unit_price / 1.20");
  });
  it("recalculates persisted totals after applying the generated estimate VAT mode", () => {
    expect(vatTotalsSql).toContain("create or replace function public.create_estimate_from_generator_v3");
    expect(vatTotalsSql).toContain("set vat_mode = target_vat_mode");
    expect(vatTotalsSql).toContain("perform public.recalculate_estimate_totals(created_estimate_id)");
    expect(vatTotalsSql.indexOf("set vat_mode = target_vat_mode")).toBeLessThan(
      vatTotalsSql.indexOf("perform public.recalculate_estimate_totals(created_estimate_id)"),
    );
    expect(vatTotalsSql).toContain("existing_estimate_id is not null");
    expect(vatTotalsSql).toContain("security definer");
    expect(vatTotalsSql).toContain("set search_path = public");
  });
});
