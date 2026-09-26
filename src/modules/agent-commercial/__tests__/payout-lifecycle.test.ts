import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(join(root, "supabase/migrations/20260926120200_agent_reward_governed_payout.sql"), "utf8");
const actions = readFileSync(join(root, "src/modules/agent-commercial/actions.ts"), "utf8");
const adminBlock = readFileSync(join(root, "src/modules/agent-commercial/AdminCommercialBlock.tsx"), "utf8");
const financeDetail = readFileSync(join(root, "app/(admin)/admin/agents/rewards/[saleLinkId]/page.tsx"), "utf8");
const agentRewards = readFileSync(join(root, "app/(agent)/agent/rewards/page.tsx"), "utf8");

describe("Agent reward governed payout contract", () => {
  it("permits payout only from authoritative READY_FOR_PAYOUT evidence", () => {
    expect(migration).toContain("current.state <> 'READY_FOR_PAYOUT'");
    expect(migration).toContain("projection.state <> 'FULLY_PAID'");
    expect(migration).toContain("projection.payment_state <> 'FULLY_PAID'");
    expect(migration).toContain("not current.classification_complete");
    expect(migration).not.toContain("p_reward_amount");
  });

  it("records authoritative amount, actor, reference, time, and an audit event", () => {
    expect(migration).toContain("paid_by = p_actor_user_id");
    expect(migration).toContain("payout_reference = normalized_reference");
    expect(migration).toContain("reward_amount, currency, payout_reference");
    expect(migration).toContain("current.forecast_reward_amount, current.currency, normalized_reference");
    expect(migration).toContain("'AGENT_REWARD_STATUS_CHANGED'");
  });

  it("is idempotent for a replay and rejects a stale concurrent payout", () => {
    expect(migration).toContain("current.payout_idempotency_key = p_idempotency_key");
    expect(migration).toContain("'outcome', 'ALREADY_APPLIED'");
    expect(migration).toContain("current.updated_at is distinct from p_expected_updated_at");
    expect(migration).toContain("errcode = '40001'");
    expect(migration).toContain("for update");
  });

  it("removes the evidence-free PAID transition and keeps the dedicated Finance permission", () => {
    expect(adminBlock).not.toContain('READY_FOR_PAYOUT: ["PAID"');
    expect(actions).toContain('requireAdminPermission("admin.agent_rewards.approve")');
    expect(actions).toContain('formData.get("confirmPayout")');
    expect(migration).toContain("grant execute on function public.confirm_agent_reward_payout_record");
    expect(migration).not.toContain("confirm_agent_reward_payout_record(uuid, uuid, timestamptz, uuid, text, text) to authenticated");
  });

  it("requires deliberate confirmation without allowing Finance to edit the amount", () => {
    expect(financeDetail).toContain("PayoutConfirmationForm");
    expect(financeDetail).toContain("reward.amount");
    expect(financeDetail).not.toContain('name="amount"');
    expect(financeDetail).toContain("Документы оплаты клиента");
  });

  it("exposes Agent-safe status and paid date without Finance-only payout metadata", () => {
    expect(migration).toContain("'paidAt', paid_at");
    expect(migration).toContain("'safeBlockedReason'");
    const rewardsFunction = migration.slice(migration.indexOf("create or replace function public.get_agent_cabinet_rewards()"));
    expect(rewardsFunction).not.toContain("'payoutReference'");
    expect(rewardsFunction).not.toContain("'payoutNote'");
    expect(agentRewards).toContain("agentRewardStateCopy");
    expect(agentRewards).toContain("item.paidAt");
    expect(agentRewards).not.toContain("payoutReference");
  });
});
