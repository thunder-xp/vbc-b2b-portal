import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PartnerTopCategoryFilterBar, buildTopCategoryHref, toggleTopCategorySelection } from "../PartnerTopCategoryFilterBar";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/cabinet/repeat-purchase",
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams("search=camera&page=3"),
}));

const video = "11111111-1111-4111-8111-111111111111";
const access = "22222222-2222-4222-8222-222222222222";
const fire = "33333333-3333-4333-8333-333333333333";
const categories = [
  { code: "video" as const, label: "ВИДЕО", categoryIds: [video], productCount: 6 },
  { code: "access" as const, label: "СКУД", categoryIds: [access], productCount: 2 },
  { code: "security" as const, label: "ОПС", categoryIds: [fire], productCount: 1 },
];

describe("PartnerTopCategoryFilterBar", () => {
  beforeEach(() => push.mockClear());

  it("marks All active only without selected categories", () => {
    const { rerender } = render(<PartnerTopCategoryFilterBar allCount={9} allLabel="Все" categories={categories} selectedCategoryIds={[]} />);
    expect(screen.getByRole("button", { name: "Все 9" })).toHaveAttribute("aria-pressed", "true");
    rerender(<PartnerTopCategoryFilterBar allCount={9} allLabel="Все" categories={categories} selectedCategoryIds={[video]} />);
    expect(screen.getByRole("button", { name: "Все 9" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "ВИДЕО 6" })).toHaveAttribute("aria-pressed", "true");
  });

  it("adds a second category, toggles active categories off, and returns to All", () => {
    expect(toggleTopCategorySelection([video], [access])).toEqual([video, access].sort());
    expect(toggleTopCategorySelection([video, access], [video])).toEqual([access]);
    expect(toggleTopCategorySelection([access], [access])).toEqual([]);
  });

  it("clears categories while preserving search and removes paging and legacy category state", () => {
    const current = new URLSearchParams(`category=${video}&categorySet=video&categories=${video}&search=dahua&page=4`);
    expect(buildTopCategoryHref("/cabinet/catalog", current, []))
      .toBe("/cabinet/catalog?search=dahua");
  });

  it("uses one URL-backed interaction contract for category union and All reset", () => {
    render(<PartnerTopCategoryFilterBar allCount={9} allLabel="Все" categories={categories} selectedCategoryIds={[video]} />);
    fireEvent.click(screen.getByRole("button", { name: "СКУД 2" }));
    expect(push).toHaveBeenLastCalledWith(`/cabinet/repeat-purchase?search=camera&categories=${[video, access].sort().join("%2C")}`);
    fireEvent.click(screen.getByRole("button", { name: "Все 9" }));
    expect(push).toHaveBeenLastCalledWith("/cabinet/repeat-purchase?search=camera");
  });
});
