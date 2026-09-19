import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { agentStatusCopy, referralStatusCopy } from "../copy";

const root = process.cwd();
const migration = readFileSync(join(root, "supabase/migrations/20260913144354_agent_cabinet_ui_v1.sql"), "utf8");
const auditMigration = readFileSync(join(root, "supabase/migrations/20260913151458_agent_profile_update_audit.sql"), "utf8");
const layout = readFileSync(join(root, "app/(agent)/agent/layout.tsx"), "utf8");
const qrPage = readFileSync(join(root, "app/(agent)/agent/qr/page.tsx"), "utf8");
const service = readFileSync(join(root, "src/modules/agent-cabinet/service.ts"), "utf8");
const profilePage = readFileSync(join(root, "app/(agent)/agent/profile/page.tsx"), "utf8");

describe("Agent Cabinet V1 contract", () => {
  it("maps every governed lifecycle and referral status to agent-safe RU copy", () => {
    expect(Object.keys(agentStatusCopy)).toHaveLength(9);
    expect(Object.keys(referralStatusCopy)).toHaveLength(11);
    expect(referralStatusCopy.CONFLICT).not.toMatch(/агент/i);
  });

  it("gates all child routes before operational content is rendered", () => {
    expect(layout).toContain('agent.accessMode === "OPERATIONAL"');
    expect(layout).toContain("<StatusGate context={agent} locale={locale}/>");
    expect(layout).not.toContain("/cabinet");
  });

  it("uses auth.uid ownership for every self-scoped detail and list projection", () => {
    expect(migration).toContain("agent.user_id = auth.uid()");
    expect(migration).toContain("join agent on agent.id = referral.agent_id");
    expect(migration).toContain("join agent on agent.id = attribution.agent_id");
    expect(migration).toContain("limit least(greatest(p_limit, 1), 20)");
    expect(migration).not.toContain("grant select on table public.agent_");
  });

  it("keeps QR opaque and profile authority fields protected", () => {
    expect(migration).toContain("public_token ~ '^[A-Za-z0-9_-]{43}$'");
    expect(service).toContain("/a/${token.publicToken}");
    expect(profilePage).toContain("agentLifecycleStatusCopy");
    expect(profilePage).not.toMatch(/complianceCopy|levelCopy|contractReady/);
    expect(migration).not.toContain("p_status text");
    expect(migration).not.toContain("p_level text");
  });

  it("does not expose partner commercial or commission data", () => {
    expect(migration).not.toMatch(/partner_price|debt|credit_limit|commission_amount/i);
    expect(qrPage).not.toMatch(/company_id|agent\.id}/);
  });

  it("audits profile edits without persisting personal values in audit metadata", () => {
    expect(auditMigration).toContain("AGENT_PROFILE_UPDATED");
    expect(auditMigration).toContain("jsonb_build_object('fields', changed_fields)");
    expect(auditMigration).not.toContain("jsonb_build_object('phone'");
  });

  it("uses an action-first daily home without financial or KPI-dashboard claims", () => {
    const home = readFileSync(join(root, "app/(agent)/agent/page.tsx"), "utf8");
    expect(home).toContain("copy.primaryAction");
    expect(home).toContain("overview.latestActivity");
    expect(home).toContain("copy.showQr");
    expect(home).not.toContain("const kpis =");
    expect(home).not.toMatch(/balance|commission|payout|0 MDL/i);
  });

  it("keeps acceptance identities local-only and outside migration data", () => {
    const fixture = readFileSync(join(root, "supabase/tests/customer_agent_cabinet_experience_fixture.sql"), "utf8");
    const setup = readFileSync(join(root, "scripts/setup-agent-cabinet-experience-fixture.mjs"), "utf8");
    expect(fixture).toContain("Local/acceptance-only fixture");
    expect(setup).toContain("refusing a non-local Supabase URL");
    expect(setup).toContain('productionMutation: false');
    expect(migration).not.toContain("Test Agent Novotech");
  });
});
