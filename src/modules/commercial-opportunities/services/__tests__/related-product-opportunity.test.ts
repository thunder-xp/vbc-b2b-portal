import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    "supabase/migrations/20260904143846_related_product_opportunities.sql",
  ),
  "utf8",
);
const dashboardService = readFileSync(
  resolve("src/modules/partner-cabinet/services/workspace-home.service.ts"),
  "utf8",
);
const dashboardView = readFileSync(
  resolve("src/modules/partner-cabinet/components/OperationalDashboard.tsx"),
  "utf8",
);
const card = readFileSync(
  resolve(
    "src/modules/commercial-opportunities/components/OpportunityCard.tsx",
  ),
  "utf8",
);

describe("high-confidence related-product opportunities", () => {
  it("uses only directional active 1C RELATED truth and mapped active products", () => {
    expect(migration).toContain("relation.relation_type = 'related'");
    expect(migration).toContain("relation.is_active");
    expect(migration).toContain(
      "relation.source_product_id <> relation.target_product_id",
    );
    expect(migration).toContain("source_product.is_active");
    expect(migration).toContain("target_product.is_active");
    expect(migration).toContain(
      "nullif(btrim(source_product.external_1c_id), '') is not null",
    );
    expect(migration).not.toContain(
      "relation.target_product_id as source_product_id",
    );
  });

  it("derives reliable completed-order evidence with all governed exclusions", () => {
    expect(migration).toContain("history.partner_visible");
    expect(migration).toContain("history.one_c_posted");
    expect(migration).toContain("not history.one_c_deletion_mark");
    expect(migration).toContain("history.one_c_state_code = 'completed'");
    expect(migration).toContain("history.origin_type <> 'internal_1c'");
    expect(migration).toContain("history.one_c_document_date <= now()");
    expect(migration).toContain("item.product_id is not null");
  });

  it("enforces the source, co-order, multi-company, and lift thresholds", () => {
    expect(migration).toContain(
      "having count(distinct order_product.order_id) >= 3",
    );
    expect(migration).toContain("having count(*) >= 2");
    expect(migration).toContain(
      "count(distinct source_order.company_id) >= 2",
    );
    expect(migration).toMatch(/relation_lift[\s\S]*?> 1/);
    expect(migration).toContain("relation_confidence");
  });

  it("suppresses same-category accessory noise and any governed analogue semantics", () => {
    expect(migration).toContain(
      "source_product.category_id is distinct from target_product.category_id",
    );
    expect(migration).toContain("analogue.relation_type = 'analog'");
    expect(migration).toContain("analogue.is_active");
    expect(migration).not.toMatch(/100078|100169|100394|PFA130|PFA134|PFA3300R/);
  });

  it("selects one strongest deterministic source explanation per company target", () => {
    expect(migration).toContain(
      "partition by evidence.target_product_id",
    );
    for (const criterion of [
      "evidence.source_purchase_count desc",
      "evidence.relation_coorder_count desc",
      "evidence.relation_confidence desc",
      "evidence.relation_lift desc",
      "evidence.source_product_id",
      "evidence.relation_id",
    ]) {
      expect(migration).toContain(criterion);
    }
    expect(migration).toContain("where ranked.explanation_rank = 1");
    expect(migration).toContain("target_company_id::text");
    expect(migration).toContain("eligible.user_id::text");
    expect(migration).toContain("eligible.target_product_id::text");
  });

  it("requires the assigned fresh partner price and authoritative daily stock", () => {
    expect(migration).toContain("company.commercial_profile_state = 'aligned'");
    expect(migration).toContain(
      "lower(price.external_1c_price_type_id)",
    );
    expect(migration).toContain(
      "price.company_id is null or price.company_id = target_company_id",
    );
    expect(migration).toContain("price.currency_status = 'resolved'");
    expect(migration).toContain("price.synced_at >= now() - interval '36 hours'");
    expect(migration).toContain("stock.freshness_state = 'authoritative'");
    expect(migration).toContain("stock.synced_at >= now() - interval '24 hours'");
    expect(migration).toContain("stock.available_quantity > 0");
    expect(migration).not.toMatch(/exchange_rate|competitor/i);
  });

  it("suppresses recent targets, active carts, stronger workflows, and repeat overlap", () => {
    expect(migration).toContain(
      "recent_history.one_c_document_date >= now() - interval '90 days'",
    );
    expect(migration).toContain("cart.created_by = member.user_id");
    expect(migration).toContain("cart.status in ('active', 'submitting')");
    expect(migration).toContain("version.status = 'prepared'");
    expect(migration).toContain("version.status = 'sent'");
    expect(migration).toContain("version.status = 'accepted'");
    expect(migration).toContain("estimate.accepted_version_id = version.id");
    expect(migration).toContain(
      "existing.opportunity_type = 'repeat_purchase_available'",
    );
    expect(migration).toContain("existing.priority < 55");
  });

  it("requires active partner membership and every action permission server-side", () => {
    expect(migration).toContain("profile.status = 'active'");
    expect(migration).toContain("membership.status = 'active'");
    for (const permission of [
      "opportunities.view",
      "catalog.view",
      "pricing.partner_price.view",
      "stock.view",
      "orders.manage",
    ]) {
      expect(migration).toContain(`'${permission}'`);
    }
    expect(migration).toContain(
      "opportunity.company_id = target_company_id",
    );
    expect(migration).toContain("opportunity.recipient_user_id = actor");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("set row_security = off");
    expect(migration).toContain(
      "revoke all on function private.partner_related_product_candidates(uuid)",
    );
  });

  it("stays in the existing async projection and one Dashboard read", () => {
    expect(migration).toContain(
      "private.refresh_partner_related_product_opportunities",
    );
    expect(migration).toContain(
      "partner_commercial_opportunity_dirty_companies",
    );
    expect(migration).toContain("'related_product',\n    'active',\n    55");
    expect(dashboardService).toContain(
      'filter: "all", limit: 12, offset: 0',
    );
    expect(dashboardView).toContain("opportunities.slice(0, 4)");
    expect(dashboardService).not.toContain("product_relations");
    expect(dashboardService).not.toContain("partner_order_history");
  });

  it("reuses the canonical cart action with quantity one and factual RU/RO copy", () => {
    expect(card).toContain("CatalogQuantityCartAction");
    expect(card).toContain('opportunity.type === "related_product"');
    expect(card).toContain("if (relatedProduct) router.refresh()");
    expect(card).toContain('related_product: "Дополняющий товар"');
    expect(card).toContain('related_product: "Produs complementar"');
    expect(card).toContain("Подобран как дополнение к");
    expect(card).toContain("Selectat ca produs complementar pentru");
  });

  it("does not introduce a second engine, live integration, AI, or browser eligibility", () => {
    expect(migration).not.toMatch(
      /create table[^]*recommend|vector|embedding|machine.learning|sales_lead|campaign_task/i,
    );
    expect(migration).not.toMatch(/http|fetch|odata|standardodata/i);
    expect(card).not.toMatch(/product_relations|partner_order_history|relationLift/);
  });
});
