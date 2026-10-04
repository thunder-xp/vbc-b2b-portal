import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readableCampaignText } from "../../copy";

const migration = fs.readFileSync(path.join(process.cwd(), "supabase/migrations/20261004160000_fix_special_offers_admin_lifecycle_and_encoding_v4.sql"), "utf8");
const detailPage = fs.readFileSync(path.join(process.cwd(), "app/(admin)/admin/commercial/campaigns/[campaignId]/page.tsx"), "utf8");

describe("Special Offers lifecycle and encoding v4", () => {
  it("keeps tombstone deletion archived-only, permissioned, and audited", () => {
    expect(migration).toContain("delete_archived_commercial_campaign_v1");
    expect(migration).toContain("has_internal_permission('campaigns.edit')");
    expect(migration).toContain("v_target.status<>'archived'");
    expect(migration).toContain("'deleted'");
    expect(migration).toContain("campaign.deleted_at is null");
    expect(migration).not.toMatch(/delete from public\.commercial_campaigns/i);
  });

  it("reopens only paused campaigns without mutating immutable published history", () => {
    expect(migration).toContain("reopen_commercial_campaign_for_edit_v1");
    expect(migration).toContain("v_target.status<>'paused'");
    expect(migration).toContain("status='draft'");
    expect(migration).toContain("'reopened_for_edit'");
    expect(migration).not.toMatch(/update public\.commercial_campaign_versions/i);
    expect(migration).not.toMatch(/delete from public\.commercial_campaign_versions/i);
    expect(migration).not.toMatch(/delete from public\.commercial_campaign_audience_snapshots/i);
  });

  it("exposes only authenticated RPC entry points", () => {
    for (const signature of [
      "reopen_commercial_campaign_for_edit_v1(uuid,text)",
      "delete_archived_commercial_campaign_v1(uuid,text)",
    ]) {
      expect(migration).toContain(`revoke all on function public.${signature} from public,anon`);
      expect(migration).toContain(`grant execute on function public.${signature} to authenticated`);
    }
  });

  it("contains readable UTF-8 Russian copy and no literal mojibake runs", () => {
    expect(detailPage).toContain("Состав предложения");
    expect(detailPage).toContain("Спеццена PROMO");
    expect(detailPage).toContain("Нет ограничения");
    expect(detailPage).not.toMatch(/\?{3,}/);
    expect(readableCampaignText("??????????", "Описание предложения недоступно.")).toBe("Описание предложения недоступно.");
    expect(readableCampaignText("Корректный текст?", "fallback")).toBe("Корректный текст?");
  });
});
