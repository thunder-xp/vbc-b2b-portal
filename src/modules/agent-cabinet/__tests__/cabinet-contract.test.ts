import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { agentStatusCopy, referralStatusCopy } from "../copy";

const root = process.cwd();
const migration = readFileSync(join(root, "supabase/migrations/20260913144354_agent_cabinet_ui_v1.sql"), "utf8");
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
    expect(layout).toContain("<StatusGate context={agent}/>");
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
    expect(profilePage).toContain("Статус, уровень, результаты проверки и договорные данные изменяет только Novotech");
    expect(migration).not.toContain("p_status text");
    expect(migration).not.toContain("p_level text");
  });

  it("does not expose partner commercial or commission data", () => {
    expect(migration).not.toMatch(/partner_price|debt|credit_limit|commission_amount/i);
    expect(qrPage).not.toMatch(/company_id|agent\.id}/);
  });
});
