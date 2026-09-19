import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

describe("Customer and Agent cabinet visual polish", () => {
  it("defines one shared visual vocabulary for both cabinets", () => {
    const header = read("src/modules/cabinet-experience/components/WorkspaceHeader.tsx");
    const patterns = read("src/modules/cabinet-experience/components/CabinetPatterns.tsx");
    for (const token of ["cabinetPageWide", "cabinetPage", "cabinetPageNarrow", "cabinetSurface", "cabinetList", "cabinetRow", "cabinetField"]) {
      expect(header).toContain(`export const ${token}`);
    }
    expect(patterns).toContain("CabinetStatusBadge");
    expect(patterns).toContain("CabinetFeedback");
  });

  it("uses the shared page, action, row, and status system across high-frequency routes", () => {
    const files = [
      "app/account/(private)/page.tsx",
      "app/account/(private)/orders/page.tsx",
      "app/account/(private)/service/page.tsx",
      "app/(agent)/agent/page.tsx",
      "app/(agent)/agent/referrals/page.tsx",
      "app/(agent)/agent/clients/page.tsx",
    ].map(read).join("\n");
    expect(files).toMatch(/cabinetPage(?:Wide)?/);
    expect(files).toContain("cabinetList");
    expect(files).toContain("cabinetRow");
    expect(files).toContain("CabinetStatusBadge");
  });

  it("provides explicit save, error, conflict, loading, and empty feedback", () => {
    const forms = [
      "src/modules/final-customer/components/CustomerProfileForm.tsx",
      "src/modules/final-customer/components/CustomerServiceRequestForm.tsx",
      "src/modules/final-customer/components/CustomerServiceReplyForm.tsx",
      "src/modules/agent-cabinet/components/ProfileForm.tsx",
    ].map(read).join("\n");
    expect(forms).toContain('tone="saved"');
    expect(forms).toContain('tone="error"');
    expect(forms).toContain('"conflict"');
    expect(forms).toContain("disabled={pending}");
    expect(read("src/modules/cabinet-experience/components/CabinetAsyncStates.tsx")).toContain('aria-busy="true"');
    expect(read("src/modules/cabinet-experience/components/CabinetErrorState.tsx")).not.toMatch(/digest|stack|internal code/i);
  });

  it("keeps navigation at five destinations with accessible touch geometry", () => {
    const navigation = read("src/modules/cabinet-experience/components/CabinetNavigation.tsx");
    expect(navigation).toContain("min-h-14");
    expect(navigation).toContain("focus-visible:outline-2");
    expect(navigation).toContain("motion-reduce:transition-none");
    for (const file of ["src/modules/final-customer/components/CustomerNavigation.tsx", "src/modules/agent-cabinet/components/AgentNavigation.tsx"]) {
      expect(read(file).match(/href:/g)).toHaveLength(5);
    }
  });

  it("keeps Agent materials semantically equivalent in RU and RO", () => {
    const materials = read("app/(agent)/agent/materials/page.tsx");
    expect(materials).toContain("Что делает Novotech");
    expect(materials).toContain("Ce face Novotech");
    expect(materials).toContain("getAgentCabinetLocale");
  });

  it("adds presentation only and no new cabinet data access", () => {
    const script = read("scripts/customer-agent-visual-polish-acceptance.mjs");
    expect(script).toContain("productionMutation: false");
    expect(script).toContain("businessRequestsAdded: 0");
    expect(script).toContain("1920, 1080");
  });
});
