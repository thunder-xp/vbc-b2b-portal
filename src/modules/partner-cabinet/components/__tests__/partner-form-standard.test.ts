import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("Partner form visual standard", () => {
  it("scopes common form geometry and typography to Partner content", () => {
    const layout = read("src/modules/partner-cabinet/components/PartnerLayout.tsx");
    const styles = read("src/modules/partner-cabinet/components/PartnerFormStandard.module.css");

    expect(layout).toContain("PartnerFormStandard.module.css");
    expect(layout).toContain("formStyles.formStandard");
    expect(styles).toContain("font-size: 11px");
    expect(styles).toContain("height: 36px");
    expect(styles).toContain("font-size: 12px");
    expect(styles).toContain("height: 40px");
  });

  it("preserves semantics while standardizing selects, states, and numeric inputs", () => {
    const styles = read("src/modules/partner-cabinet/components/PartnerFormStandard.module.css");

    expect(styles).toContain("appearance: none");
    expect(styles).toContain("background-image: url");
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("[aria-invalid=\"true\"]");
    expect(styles).toContain(":disabled");
    expect(styles).toContain("font-variant-numeric: tabular-nums");
    expect(styles).toContain("input[type=\"checkbox\"]");
    expect(styles).toContain("input[type=\"radio\"]");
  });

  it("does not style hidden or file payload controls as visible fields", () => {
    const styles = read("src/modules/partner-cabinet/components/PartnerFormStandard.module.css");

    expect(styles).toContain(":not([type=\"hidden\"])");
    expect(styles).toContain(":not([type=\"file\"])");
  });
});
