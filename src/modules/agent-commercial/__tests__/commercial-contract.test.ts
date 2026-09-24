import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(join(root, "supabase/migrations/20260923191606_agent_commercial_sales_rewards_v1.sql"), "utf8");
const provider = readFileSync(join(root, "src/modules/agent-commercial/one-c-provider.ts"), "utf8");
const evidence = readFileSync(join(root, "src/modules/agent-commercial/evidence.ts"), "utf8");
const actions = readFileSync(join(root, "src/modules/agent-commercial/actions.ts"), "utf8");
const navigation = readFileSync(join(root, "src/modules/agent-cabinet/components/AgentNavigation.tsx"), "utf8");

describe("Agent commercial cabinet contract", () => {
  it("seeds the versioned V1 policy and retains the selected version", () => {
    expect(migration).toContain("'EQUIPMENT', 4.0000::numeric");
    expect(migration).toContain("'NOVOTECH_INSTALLATION', 8.0000::numeric");
    expect(migration).toContain("'EXCLUDED', 0.0000::numeric");
    expect(migration).toContain("coalesce(previous_reward.policy_id, policy.id)");
  });

  it("keys links and classifications by exact 1C Ref_Key", () => {
    expect(migration).toContain("source_order_1c_ref text not null");
    expect(migration).toContain("source_nomenclature_1c_ref text primary key");
    expect(migration).toContain("1C projection identity mismatch");
    expect(provider).toContain("filter: `Number eq");
    expect(provider).toContain("Заказ eq '${order.reference}'");
    expect(provider).not.toContain("Заказ eq guid'${order.reference}'");
    expect(evidence).toContain("exactTypedOrder(row[\"Заказ\"], row[\"Заказ_Type\"], order.reference)");
    expect(provider).toContain("ДокументОснование eq '${order.reference}'");
    expect(provider).toContain("ЗаказПокупателя_Key eq guid'${order.reference}'");
    expect(provider).toContain("agent_commercial_delivery_bounded_scan");
    expect(provider).toContain("page < EVIDENCE_MAX_PAGES");
    expect(provider).toContain("getOrder(reference");
    expect(actions).toContain('formData.get("confirmExact")');
    expect(evidence).not.toMatch(/includes\(.+name|name.+includes/i);
  });

  it("fails unclassified realization lines closed and never pays automatically", () => {
    expect(migration).toContain("BLOCKED_FROM_CALCULATION");
    expect(migration).toContain("payment_state = 'FULLY_PAID' and not complete");
    expect(migration).toContain("when payment_state = 'FULLY_PAID' and complete then 'ELIGIBLE'");
    expect(migration).not.toContain("then 'PAID'");
    expect(migration).toContain("does not calculate tax or execute payout");
    expect(migration).not.toMatch(/create table public\..*(tax|withholding)/i);
  });

  it("keeps privileged mutation service-only and Agent reads ownership-scoped", () => {
    for (const signature of [
      "public.link_commercial_agent_1c_record(uuid, text, text, text, text, uuid)",
      "public.create_agent_sale_link_record(uuid, uuid, uuid, text, text, date, text, text, numeric, text, uuid)",
      "public.import_agent_order_referral_record(uuid, text, text, text, text, text, uuid)",
      "public.upsert_agent_sale_projection_record(uuid, jsonb, uuid)",
      "public.transition_agent_reward_record(uuid, text, uuid, text)",
    ]) {
      expect(migration).toContain(`revoke all on function ${signature} from public, anon, authenticated, service_role`);
      expect(migration).toContain(`grant execute on function ${signature} to service_role`);
    }
    expect(migration).toContain("agent.user_id = auth.uid()");
    expect(migration).toContain("agent.status = 'ACTIVE'");
    expect(migration).not.toContain("grant select on table public.agent_sale_links to authenticated");
  });

  it("supports a governed historical pilot referral without inventing contact data", () => {
    expect(migration).toContain("referral_code text not null default private.next_agent_referral_code()");
    expect(migration).toContain("'REF-' || extract(year from current_date)");
    expect(migration).toContain("identity_resolution_reason = 'EXACT_1C_REF'");
    expect(migration).toContain("'ADMIN_RECORDED', 'ADMIN'");
    expect(migration).toContain("campaign_ref is null and public_token is not null");
    expect(migration).toContain("Fresh active primary referral token is required.");
  });

  it("keeps reward decisions behind the dedicated Finance permission", () => {
    expect(actions).toContain('requireAdminPermission("admin.agent_rewards.approve")');
    expect(actions).not.toContain("requireAnyAdminPermission");
    expect(migration).not.toContain("current.state = 'BLOCKED' and p_target_state = 'FINANCE_REVIEW'");
  });

  it("adds RU/RO parity routes for deals and rewards", () => {
    expect(navigation).toContain('href: "/agent/deals"');
    expect(navigation).toContain('href: "/agent/rewards"');
    const copy = readFileSync(join(root, "src/modules/agent-cabinet/copy.ts"), "utf8");
    expect(copy).toContain('deals: "Сделки"');
    expect(copy).toContain('rewards: "Вознаграждения"');
    expect(copy).toContain('deals: "Tranzacții"');
    expect(copy).toContain('rewards: "Recompense"');
  });
});
