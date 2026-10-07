import { describe, expect, it } from "vitest";
import { catalogNavigationIcons, partnerNavigationIconRegistry, partnerNavigationIcons } from "../partner-navigation-icons";

describe("canonical Partner navigation icons", () => {
  it("assigns a distinct icon to every destination and parent group", () => {
    const entries = Object.values(partnerNavigationIconRegistry);
    expect(new Set(entries.map((entry) => entry.iconKey)).size).toBe(entries.length);
    expect(new Set(entries.map((entry) => entry.Icon)).size).toBe(entries.length);
    for (const [key, entry] of Object.entries(partnerNavigationIconRegistry)) {
      expect(partnerNavigationIcons[key as keyof typeof partnerNavigationIcons]).toBe(entry.Icon);
    }
  });

  it("reuses the canonical destination icons in catalog transitions", () => {
    expect(catalogNavigationIcons.showcase).toBe(partnerNavigationIcons.catalog);
    expect(catalogNavigationIcons.catalog).toBe(partnerNavigationIcons.catalog_full);
  });
});
