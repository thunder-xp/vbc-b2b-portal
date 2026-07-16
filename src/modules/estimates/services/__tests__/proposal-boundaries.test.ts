import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("proposal architecture boundaries", () => {
  it("keeps Supabase and PDF generation out of React", () => {
    const ui = ["src/modules/estimates/components/ProposalDocument.tsx", "src/modules/estimates/components/ProposalControls.tsx"].map(read).join("\n");
    expect(ui).not.toMatch(/supabase|createClient|pdfMake|internalCost|overallMargin/i);
  });
  it("uses one customer DTO for preview and PDF and blocks remote PDF URLs", () => {
    const renderer = read("src/modules/estimates/services/proposal-pdf.renderer.ts");
    const service = read("src/modules/estimates/services/proposal.service.ts");
    expect(renderer).toContain("CustomerProposalDto");
    expect(service).toContain("prepareCustomerProposal");
    expect(renderer).toContain("setUrlAccessPolicy(() => false)");
  });
  it("bulk loads product images and does not query per line", () => {
    const repository = read("src/modules/estimates/repositories/supabase/proposal.supabase-repository.ts");
    expect(repository).toContain('.in("id", [...new Set(productIds)])');
    expect(repository).not.toMatch(/for\s*\([^)]*\)\s*\{[\s\S]*?\.from\("catalog_products"\)/);
  });
});
