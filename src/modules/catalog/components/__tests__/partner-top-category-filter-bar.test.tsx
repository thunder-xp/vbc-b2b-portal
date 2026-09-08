import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PartnerTopCategoryFilterBar, buildTopCategoryHref, toggleTopCategorySelection } from "../PartnerTopCategoryFilterBar";

const video = "11111111-1111-4111-8111-111111111111";
const access = "22222222-2222-4222-8222-222222222222";
const fire = "33333333-3333-4333-8333-333333333333";
const categories = [
  { code: "video" as const, label: "VIDEO", categoryIds: [video], productCount: 6 },
  { code: "access" as const, label: "ACCESS", categoryIds: [access], productCount: 2 },
  { code: "security" as const, label: "SECURITY", categoryIds: [fire], productCount: 1 },
];

describe("PartnerTopCategoryFilterBar", () => {
  it("marks All active only without selected categories", () => {
    const { rerender } = render(<PartnerTopCategoryFilterBar allCount={9} allLabel="ALL" categories={categories} currentHref="/cabinet/repeat-purchase?search=camera&page=3" selectedCategoryIds={[]} />);
    expect(screen.getByRole("link", { name: "ALL 9" })).toHaveAttribute("aria-current", "page");
    rerender(<PartnerTopCategoryFilterBar allCount={9} allLabel="ALL" categories={categories} currentHref={`/cabinet/repeat-purchase?search=camera&categories=${video}`} selectedCategoryIds={[video]} />);
    expect(screen.getByRole("link", { name: "ALL 9" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "VIDEO 6" })).toHaveAttribute("aria-current", "page");
  });

  it("adds a second category, toggles active categories off, and returns to All", () => {
    expect(toggleTopCategorySelection([video], [access])).toEqual([video, access].sort());
    expect(toggleTopCategorySelection([video, access], [video])).toEqual([access]);
    expect(toggleTopCategorySelection([access], [access])).toEqual([]);
  });

  it("clears categories while preserving search and removes paging and legacy category state", () => {
    expect(buildTopCategoryHref(`/cabinet/catalog?category=${video}&categorySet=video&categories=${video}&search=dahua&page=4`, []))
      .toBe("/cabinet/catalog?search=dahua");
  });

  it("uses one URL-backed interaction contract for category union and All reset", () => {
    render(<PartnerTopCategoryFilterBar allCount={9} allLabel="ALL" categories={categories} currentHref={`/cabinet/repeat-purchase?search=camera&page=3&categories=${video}`} selectedCategoryIds={[video]} />);
    expect(screen.getByRole("link", { name: "ACCESS 2" }))
      .toHaveAttribute("href", `/cabinet/repeat-purchase?search=camera&categories=${[video, access].sort().join("%2C")}`);
    expect(screen.getByRole("link", { name: "ALL 9" })).toHaveAttribute("href", "/cabinet/repeat-purchase?search=camera");
  });
});
