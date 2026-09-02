import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repository = readFileSync(resolve("src/modules/partner-sales-workspace/supabase.repository.ts"), "utf8");
const dashboard = readFileSync(resolve("src/modules/partner-cabinet/components/OperationalDashboard.tsx"), "utf8");
const copy = readFileSync(resolve("src/modules/partner-locale/copy.ts"), "utf8");
const workspace = readFileSync(resolve("src/modules/partner-cabinet/services/workspace-home.service.ts"), "utf8");
const capabilities = readFileSync(resolve("src/modules/partner-cabinet/services/workspace-capability.service.ts"), "utf8");

describe("estimate sales workspace boundaries", () => {
  it("uses one bounded company-scoped server read with no browser Supabase access", () => {
    expect(repository).toContain('import "server-only"');
    expect(repository).toContain('.eq("company_id", companyId)');
    expect(repository).toContain(".limit(");
    expect(repository.match(/\.from\(/g)).toHaveLength(1);
    expect(dashboard).not.toMatch(/supabase|createClient/);
    expect(workspace).toContain("context.capabilities.canViewEstimates");
    expect(workspace).toContain("context.capabilities.canSendProposal");
    expect(capabilities).toContain('canViewEstimates: hasPermission("estimates.view")');
    expect(capabilities).toContain('canSendProposal: hasPermission("proposal.send")');
  });

  it("keeps one direct governed route and full RU/RO sales copy", () => {
    expect(dashboard).toContain('href={item.href}');
    expect(dashboard).toContain('eventName="dashboard_continue_work_clicked"');
    for (const value of ["КП готово к отправке", "Ожидается решение клиента", "Oferta este gata de trimis", "Se așteaptă decizia clientului"]) expect(copy).toContain(value);
  });
});
