import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { agentOnboardingReadiness } from "../operational-presentation";
import type { AgentCabinetContext } from "../types";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const context: AgentCabinetContext = {
  id: "agent",
  agentCode: "AG-1",
  agentType: "INDIVIDUAL",
  displayName: "Agent",
  legalName: null,
  phone: null,
  email: null,
  locality: null,
  profession: null,
  workplace: null,
  status: "APPLIED",
  complianceStatus: "PENDING",
  level: "START",
  contractReady: false,
  accessMode: "STATUS_ONLY",
};

describe("Agent return-value UX", () => {
  it("derives a truthful checklist and one governed next action", () => {
    expect(agentOnboardingReadiness(context)).toEqual({
      items: [
        { code: "APPLICATION", complete: true },
        { code: "COMPLIANCE", complete: false },
        { code: "CONTRACT", complete: false },
        { code: "ACTIVATION", complete: false },
      ],
      nextAction: "WAIT_REVIEW",
      terminal: false,
    });
    expect(agentOnboardingReadiness({ ...context, status: "ACTIVE", complianceStatus: "APPROVED", contractReady: true }).nextAction).toBe("NONE");
  });

  it("keeps the QR route action-first without financial promises", () => {
    const page = read("app/(agent)/agent/qr/page.tsx");
    const share = read("src/modules/agent-cabinet/components/QrShare.tsx");
    expect(share).toContain('id="referral-link"');
    expect(page).toContain('role="img"');
    expect(share).toContain("navigator.share");
    expect(share).toContain("navigator.clipboard.writeText");
    expect(`${page}\n${share}`).not.toMatch(/commission|payout|balance|guaranteed/i);
  });

  it("localizes the profile and keeps authority fields out of editing", () => {
    const page = read("app/(agent)/agent/profile/page.tsx");
    const form = read("src/modules/agent-cabinet/components/ProfileForm.tsx");
    expect(page).toContain('locale === "ro"');
    expect(form).toContain('locale === "ro"');
    expect(form).not.toMatch(/complianceStatus|contractReady|agentType|level/);
  });

  it("links bounded human-readable activity to its referral", () => {
    const home = read("app/(agent)/agent/page.tsx");
    expect(home).toContain("overview.latestActivity.map");
    expect(home).toContain("item.referralId ?");
    expect(home).toContain("agentEventCopy[locale][item.eventType]");
    expect(home).not.toContain("commission");
  });
});
