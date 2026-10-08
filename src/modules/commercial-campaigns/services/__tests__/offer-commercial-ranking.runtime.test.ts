import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  campaignCommercialSummary,
  previewCommercialViews,
} from "../campaign-commercial-projection";
import type { CampaignProduct } from "../../types";

// Explicit opt-in: no URLs/cloud targets, no production impersonation, no shared local DB.
const enabled = process.env.V3B_RUNTIME_ACCEPTANCE === "1";
const container = "supabase_db_offer-feed-v3b-20261008";
const task = "VBC-SPECIAL-OFFERS-V3B-COMMERCIAL-ATTRACTIVENESS-20261008";
function query(sql: string): string {
  const inspection = spawnSync("docker", ["inspect", container], {
    encoding: "utf8",
  });
  if (inspection.status !== 0)
    throw new Error("Task-owned disposable database missing");
  const info = JSON.parse(inspection.stdout)[0];
  if (
    info.Config.Labels["com.supabase.cli.project"] !==
      "offer-feed-v3b-20261008" ||
    info.NetworkSettings.Ports["5432/tcp"].some(
      (p: { HostPort: string }) => p.HostPort !== "57582",
    )
  )
    throw new Error("Disposable DB identity mismatch");
  const guarded = `do $$begin if current_setting('intent.disposable_task',true) is distinct from '${task}' then raise exception 'Wrong task DB';end if;end $$;\n${sql}`;
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "supabase_admin",
      "-d",
      "postgres",
      "-Atq",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: guarded, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

describe.skipIf(!enabled)("V3B isolated SQL ordering acceptance", () => {
  it("proves all sorts, pagination, null/zero stock, evidence guardrails and company isolation", () => {
    expect(() =>
      query(
        readFileSync(
          "supabase/tests/partner_offer_commercial_ranking_v3b.sql",
          "utf8",
        ),
      ),
    ).not.toThrow();
  });
  it("keeps ranking saving/markup equal to the canonical Decimal projection for all six mechanics", () => {
    const migration = readFileSync(
      "supabase/migrations/20261008204028_partner_offer_commercial_ranking_v3b.sql",
      "utf8",
    );
    const ctes =
      migration.slice(
        migration.indexOf(" with authorized as materialized"),
        migration.indexOf(" ), ranked as ("),
      ) + " )";
    const rows = JSON.parse(
      query(`begin;
      set local request.jwt.claim.sub='aa500000-0000-4000-8000-000000000002';
      create temporary table factor_parity(result jsonb);
      do $$declare p_company_id uuid='ba500000-0000-4000-8000-000000000001';p_filter text='active';p_mechanic text='all';p_sort text='recommended';p_search text='';p_category_id uuid=null;p_brand_id uuid=null;can_partner boolean=true;can_retail boolean=true;begin
      insert into factor_parity ${ctes} select jsonb_agg(to_jsonb(f)||jsonb_build_object('lines',(select jsonb_agg(to_jsonb(l)) from rank_lines l where l.campaign_id=f.campaign_id and l.item_id is not distinct from f.item_id and l.economic_line))) from rank_factors f;
      end $$;select result from factor_parity;rollback;`),
    );
    expect(rows).toHaveLength(43);
    const mechanics = new Set<string>();
    for (const row of rows) {
      const lines = row.lines as Array<{
        product_id: string;
        units: number;
        special_price: number;
        special_currency: "USD" | "MDL";
        normal_price: number;
        normal_currency: string;
        retail_price: number;
        partner_rate: number;
        retail_rate: number;
        mechanic_type: string;
      }>;
      mechanics.add(lines[0].mechanic_type);
      const products = lines.map((l) => ({
        productId: l.product_id,
        requiredBundleQuantity: l.units,
        specialPrice: { amount: l.special_price, currency: l.special_currency },
      })) as CampaignProduct[];
      const views = previewCommercialViews({
        partnerRate: lines[0].partner_rate,
        retailRate: lines[0].retail_rate,
        products: lines.map((l) => ({
          productId: l.product_id,
          partnerPrice: { amount: l.normal_price, currency: l.normal_currency },
          retailPrice: { amount: l.retail_price, currency: "MDL" },
        })),
      });
      const summary = campaignCommercialSummary(products, views, true);
      expect(summary?.savingPercent).toBeCloseTo(row.saving_percent, 9);
      expect(summary?.markupPercent).toBeCloseTo(row.markup_percent, 9);
    }
    expect(mechanics.size).toBe(6);
  });
});
