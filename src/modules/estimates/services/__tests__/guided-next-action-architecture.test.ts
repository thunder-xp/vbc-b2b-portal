import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const lifecycle = readFileSync(resolve("src/modules/estimates/services/lifecycle.service.ts"), "utf8");
const repository = readFileSync(resolve("src/modules/estimates/repositories/supabase/lifecycle.supabase-repository.ts"), "utf8");
const workflow = readFileSync(resolve("src/modules/estimates/components/EstimateWorkflowPanel.tsx"), "utf8");
const editor = readFileSync(resolve("src/modules/estimates/components/EstimateCommercialEditor.tsx"), "utf8");
const draftReadiness = readFileSync(resolve("src/modules/estimates/services/draft-readiness.ts"), "utf8");
const dialog = readFileSync(resolve("src/modules/estimates/components/SendProposalDialog.tsx"), "utf8");
const page = readFileSync(resolve("app/(partner)/cabinet/estimates/[estimateId]/page.tsx"), "utf8");

describe("guided Estimate next-action architecture", () => {
  it("keeps the sent path on existing bulk reads and conditionally projects cart evidence only for accepted Estimates", () => {
    expect(lifecycle).toContain('estimate.lifecycleStatus === "accepted"');
    expect(lifecycle.match(/listVersionCartConversions/g)).toHaveLength(1);
    expect(lifecycle).toContain("Promise.resolve([])");
    expect(repository).toContain('.eq("estimate_id", estimateId)');
    expect(repository).toContain('.eq("version_id", versionId)');
    expect(repository).toContain('.eq("direction", "estimate_to_cart")');
    expect(repository).not.toMatch(/for\s*\([^)]*\)[\s\S]*await.*listVersionCartConversions/);
  });

  it("renders one domain projection without browser data access or component-owned blocker rules", () => {
    expect(workflow).toContain("initialWorkflow.guidedState");
    expect(workflow).toContain("guided.primaryAction");
    expect(workflow).toContain("guided.secondaryActions");
    expect(workflow).not.toMatch(/createClient|supabase|fetch\(|estimate\.lifecycleStatus\s*===/);
    expect(editor).toContain("deriveEstimateDraftReadiness");
    expect(editor).toContain("<EstimateWorkflowPanel");
    expect(page).not.toContain("workflowPanel={<EstimateWorkflowPanel");
    expect(lifecycle).toContain("deriveEstimateDraftReadiness");
    expect(draftReadiness).not.toMatch(/customer|email|stock/i);
  });

  it("keeps history authoritative but unmounted until its collapsed disclosure opens", () => {
    expect(workflow).toContain("historyOpen ?");
    expect(workflow).toContain("proposal.deliveries.map");
    expect(workflow).toContain("copy.deliveryHistory");
    expect(dialog).not.toContain("deliveries.map");
  });
});
