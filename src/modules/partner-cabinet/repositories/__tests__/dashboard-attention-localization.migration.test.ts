import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260821200338_localize_dashboard_attention_presentation.sql"), "utf8");

describe("dashboard attention localization migration", () => {
  it("keeps the v5 wrapper route-only and removes persisted presentation ownership", () => {
    expect(sql).toContain("create or replace function public.get_partner_workspace_dashboard_v5");
    expect(sql).toContain("'/cabinet/catalog/replenishment'");
    expect(sql).not.toContain("'ctaLabel'");
    expect(sql).not.toContain("Посмотреть пополнение");
  });

  it("preserves the existing privileged function safety contract", () => {
    expect(sql).toContain("stable");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = public");
    expect(sql).toContain("set row_security = off");
  });
});
