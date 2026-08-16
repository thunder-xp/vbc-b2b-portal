import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/20260812230000_governed_anonymous_retail_cart.sql"), "utf8");
const runtimeFix = readFileSync(join(process.cwd(), "supabase/migrations/20260812231000_fix_retail_cart_rpc_variable_scope.sql"), "utf8");
const bundleQuantityFix = readFileSync(join(process.cwd(), "supabase/migrations/20260812232000_allow_bounded_retail_cart_bundle_quantities.sql"), "utf8");
const objectTariffCartFix = readFileSync(join(process.cwd(), "supabase/migrations/20260815123932_align_retail_cart_work_scope_json_contract.sql"), "utf8");
const aiIntentCartFix = readFileSync(join(process.cwd(), "supabase/migrations/20260815123652_accept_ai_intent_in_retail_cart_bundle.sql"), "utf8");
const installationSnapshotFix = readFileSync(join(process.cwd(), "supabase/migrations/20260815125900_disambiguate_retail_installation_snapshot_trigger.sql"), "utf8");
const requirementSystemTypeFix = readFileSync(join(process.cwd(), "supabase/migrations/20260815130300_supply_retail_installation_requirement_system_type.sql"), "utf8");
const equipmentOnlySnapshotFix = readFileSync(join(process.cwd(), "supabase/migrations/20260815130600_skip_installation_snapshot_for_equipment_only_orders.sql"), "utf8");
const nullIntentSnapshotFix = readFileSync(join(process.cwd(), "supabase/migrations/20260815131617_handle_null_retail_installation_intent.sql"), "utf8");
const aiRequirementLineFix = readFileSync(join(process.cwd(), "supabase/migrations/20260815132015_allow_ai_installation_requirement_line.sql"), "utf8");
const actions = readFileSync(join(process.cwd(), "src/modules/public-retail/actions/retail-cart.actions.ts"), "utf8");
const service = readFileSync(join(process.cwd(), "src/modules/public-retail/services/retail-cart.service.ts"), "utf8");
const cartPage = readFileSync(join(process.cwd(), "app/cart/page.tsx"), "utf8");
const resultPage = readFileSync(join(process.cwd(), "app/calculator/cctv/result/page.tsx"), "utf8");
const addButton = readFileSync(join(process.cwd(), "src/modules/public-retail/components/PublicRetailAddToCartButton.tsx"), "utf8");
const retailShell = readFileSync(join(process.cwd(), "src/modules/public-retail/components/PublicRetailShell.tsx"), "utf8");
const cartBadge = readFileSync(join(process.cwd(), "src/modules/public-retail/components/PublicRetailCartBadgeClient.tsx"), "utf8");
const cartRepository = readFileSync(join(process.cwd(), "src/modules/public-retail/repositories/supabase/retail-cart.supabase-repository.ts"), "utf8");

describe("governed anonymous Retail Cart migration", () => {
  it("keeps the Retail aggregate separate from B2B cart and order domains", () => {
    expect(migration).toContain("create table public.retail_carts");
    expect(migration).toContain("create table public.retail_cart_items");
    expect(migration).not.toMatch(/\bpublic\.carts\b|\bpublic\.cart_items\b|partner_orders|estimates|Document_ЗаказПокупателя|one_c/i);
    expect(actions).not.toMatch(/activeCompany|companyId|checkout|partnerOrder/i);
  });

  it("stores only a high-entropy token hash and prevents anonymous table access", () => {
    expect(migration).toContain("token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$')");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on public.retail_carts, public.retail_cart_bundles, public.retail_cart_items, public.retail_cart_requests from public, anon, authenticated");
    expect(migration).not.toMatch(/customer_email|customer_phone|address|raw_token/i);
    expect(actions).toContain("rotateRetailCartTokenHash");
    expect(actions).toContain("error instanceof RetailCartExpiredError");
  });

  it("revalidates current published Public Retail rows in bounded reads", () => {
    expect(migration).toContain("publication.status='published'");
    expect(migration).toContain("product.public_id=item.public_product_id");
    expect(migration).toContain("p.public_id=p_public_product_id");
    expect(migration).not.toContain("external_1c_id");
    expect(migration).not.toContain("partner_price");
    expect(migration).toContain("'stale',current_id is null");
    expect(migration).toContain("'priceChanged',current_id is not null");
    expect(migration).toContain("coalesce(current_availability,'unavailable')");
    expect(migration.match(/with current_publication as/g)).toHaveLength(1);
  });

  it("supports deterministic duplicate add, atomic calculator insertion and retries", () => {
    expect(migration).toContain("on conflict(cart_id,public_product_id) where bundle_id is null do update");
    expect(migration).toContain("Retail quantity limit exceeded.");
    expect(migration).toContain("jsonb_to_recordset(p_items)");
    expect(cartRepository).toContain("public_product_id: item.publicProductId");
    expect(cartRepository).toContain("commercial_group: item.commercialGroup");
    expect(migration).toContain("not p_installation_intent ?& array['cameraInstallation','cableLaying','commissioning','remoteViewing']");
    expect(migration).toContain("resolved_count<>(select count(distinct public_product_id)");
    expect(migration).toContain("return previous.response");
    expect(migration).toContain("primary key (cart_id, request_id)");
  });

  it("uses revision locking and denies helper execution", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("revision=p_expected_revision");
    expect(migration).toContain("errcode='40001'");
    expect(migration).toContain("revoke all on function public.ensure_active_retail_cart(text), public.retail_cart_mutation_result(uuid,boolean,uuid) from public, anon, authenticated");
    expect(runtimeFix).toContain("target_cart_id");
    expect(runtimeFix).not.toMatch(/declare cart_id uuid|declare cart_id uuid;/i);
  });

  it("keeps standalone quantities capped while supporting governed calculator cable lengths", () => {
    expect(runtimeFix).toContain("p_quantity not between 1 and 99");
    expect(bundleQuantityFix).toContain("quantity between 1 and 20000");
    expect(bundleQuantityFix).toContain("case when p_bundle_id is null then 99 else 20000 end");
  });

  it("adds only a fully resolved calculator system through the atomic server action", () => {
    expect(resultPage).toContain('result.status === "resolved"');
    expect(resultPage).toContain("PublicRetailAddSystemButton");
    expect(resultPage).toContain('line.group === "materials"');
    expect(resultPage).toContain("unitCode: line.unitCode");
    expect(service).toContain("repository.addBundle");
  });

  it("revalidates object-specific installation pricing through the canonical resolver", () => {
    expect(objectTariffCartFix).toContain("public.resolve_cctv_object_services");
    expect(objectTariffCartFix).toContain("when 'production' then 'industrial'");
    expect(objectTariffCartFix).toContain("ai_scenario_programming");
    expect(objectTariffCartFix).not.toContain("tariff.service_type=scope.kind");
    expect(objectTariffCartFix).toContain("jsonb_array_elements(p_work_scope) with ordinality");
    expect(objectTariffCartFix).toContain("item.value->>'unitCode' unit_code");
  });

  it("persists the governed AI-service intent without weakening the bundle contract", () => {
    expect(aiIntentCartFix).toContain("'aiScenarioProgramming'");
    expect(aiIntentCartFix).toContain("jsonb_object_keys(p_installation_intent)) <> 5");
    expect(aiIntentCartFix).toContain("jsonb_typeof(p_installation_intent->'aiScenarioProgramming') <> 'boolean'");
  });

  it("keeps the installation snapshot trigger unambiguous and trigger-only", () => {
    expect(installationSnapshotFix).toContain("installation_price_snapshot as bundle_snapshot");
    expect(installationSnapshotFix).toContain("into snapshot_count, snapshot_payload");
    expect(installationSnapshotFix).not.toMatch(/installation_price_snapshot snapshot\b/);
    expect(installationSnapshotFix).toContain("from public, anon, authenticated, service_role");
  });

  it("supplies the governed CCTV system type during paid installation activation", () => {
    expect(requirementSystemTypeFix).toContain("retail_order_id, system_type, selection_mode");
    expect(requirementSystemTypeFix).toContain("orders.id, 'cctv', orders.installation_selection_mode");
    expect(requirementSystemTypeFix).toContain("to service_role");
  });

  it("does not require an installation snapshot when every governed intent is false", () => {
    expect(equipmentOnlySnapshotFix).toContain("jsonb_each(coalesce(bundle->'intent', '{}'::jsonb))");
    expect(equipmentOnlySnapshotFix).toContain("and (intent.value)::boolean");
    expect(equipmentOnlySnapshotFix).toContain("return new");
  });

  it("treats a JSON-null installation intent as equipment-only", () => {
    expect(nullIntentSnapshotFix).toContain("when jsonb_typeof(bundle->'intent') = 'object'");
    expect(nullIntentSnapshotFix).toContain("else '{}'::jsonb");
    expect(nullIntentSnapshotFix).toContain("return new");
  });

  it("retains governed AI programming in the paid installation requirement", () => {
    expect(aiRequirementLineFix).toContain("installation_requirement_lines_service_type_check");
    expect(aiRequirementLineFix).toContain("'ai_scenario_programming'");
  });

  it("renders bilingual responsive review with pilot-gated checkout and no reservation", () => {
    expect(cartPage).toContain("Добавление в корзину не резервирует товар");
    expect(cartPage).toContain("Adăugarea în coș nu rezervă produsul");
    expect(cartPage).toContain("Продолжить выбор");
    expect(cartPage).toContain("hasRetailCheckoutAccess");
    expect(cartPage).toContain("Оформить заказ");
    expect(cartPage).not.toMatch(/Оплатить|Plătește/i);
    expect(cartPage).toContain("sm:grid-cols-[80px_minmax(0,1fr)_auto]");
    expect(addButton).toContain("PUBLIC_RETAIL_CART_UPDATED_EVENT");
    expect(addButton).not.toContain("router.refresh");
    expect(retailShell).toContain('aria-label="Novotech Systems Distribution"');
    expect(retailShell).toContain("publicCompanyContent.descriptor[locale]");
    expect(retailShell).toContain('src="/brand/novotech-symbol.webp"');
    expect(retailShell).toContain('src="/brand/novotech-logo-light.webp"');
    expect(retailShell).not.toContain("ShieldCheck");
    expect(retailShell).toContain('<PublicRetailCartBadge locale={locale} totalQuantity={cartQuantity} />');
    expect(cartBadge).toContain('quantity > 99 ? "99+" : quantity');
  });
});
