import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const section = readFileSync("src/modules/purchasing-lists/components/SavedKitsSection.tsx", "utf8");
const save = readFileSync("src/modules/purchasing-lists/components/SaveLiveSelectionAsKitButton.tsx", "utf8");

describe("saved kit responsive geometry", () => {
  it("keeps all mobile actions at least 44px and uses a bottom sheet before desktop rail", () => {
    expect(section).toContain("min-h-11");
    expect(section).toContain("inset-x-0 bottom-0");
    expect(section).toContain("sm:inset-y-0 sm:left-auto sm:right-0");
    expect(section).not.toContain("<table");
    expect(save).toContain("min-h-11");
  });

  it("keeps initial cards bounded and commercial truth lazy", () => {
    expect(section).toContain("initialKits");
    expect(section).toContain("getLiveCommerceKitAction");
    expect(section).toContain("prepareLiveCommerceKitSelectionAction");
  });
});
