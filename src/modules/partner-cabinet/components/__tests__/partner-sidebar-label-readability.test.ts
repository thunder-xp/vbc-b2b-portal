import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(file), "utf8");

describe("partner sidebar label readability", () => {
  it("uses a balanced expanded width without compressing labels", () => {
    const layout = source("src/modules/partner-cabinet/components/PartnerLayout.tsx");
    const mobile = source("src/modules/partner-cabinet/components/PartnerMobileNavigation.tsx");

    expect(layout).toContain("lg:w-72");
    expect(layout).toContain("lg:pl-72");
    expect(mobile).toContain("w-72 max-w-[85vw]");
  });

  it("never applies ellipsis to expanded navigation labels", () => {
    const sidebar = source("src/modules/partner-cabinet/components/PartnerSidebar.tsx");
    const capabilities = source("src/modules/partner-cabinet/services/workspace-capability.service.ts");

    expect(sidebar).not.toContain("flex-1 truncate");
    expect(sidebar.match(/flex-1 whitespace-nowrap/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(capabilities).toContain("Возможности для закупки");
    expect(capabilities).toContain("Специальные предложения");
    expect(sidebar).toContain('label={t("nav.group.support")}');
    expect(sidebar).toContain("partnerNavigationLabel(locale, item.key)");
    expect(sidebar).toContain('className="size-4 shrink-0"');
  });
});
