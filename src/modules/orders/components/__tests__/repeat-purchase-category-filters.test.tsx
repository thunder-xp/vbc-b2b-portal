import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RepeatPurchaseCategoryFilters } from "../RepeatPurchaseCategoryFilters";
import { repeatPurchaseHref } from "../repeat-purchase-query";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const categories = [
  { id: "529fe1ae-6b66-4446-bfe7-0727fc4b9627", name: "Video", productCount: 6 },
  { id: "0c070eeb-80a5-4970-9864-70ab1bea810c", name: "Power", productCount: 2 },
];

describe("repeat purchase category filters", () => {
  beforeEach(() => push.mockClear());

  it("builds stable repeated category parameters with search and pagination", () => {
    expect(repeatPurchaseHref({ categoryIds: categories.map((item) => item.id), page: 2, search: "camera" }))
      .toBe(`/cabinet/repeat-purchase?category=${categories[0].id}&category=${categories[1].id}&search=camera&page=2`);
  });

  it("adds a second category with OR URL state and toggles an active category off", () => {
    const { rerender } = render(<RepeatPurchaseCategoryFilters allCount={8} allLabel="Все" categories={categories} search="camera" selectedCategoryIds={[categories[0].id]} />);
    fireEvent.click(screen.getByRole("button", { name: "Power 2" }));
    expect(push).toHaveBeenLastCalledWith(`/cabinet/repeat-purchase?category=${categories[0].id}&category=${categories[1].id}&search=camera`);

    rerender(<RepeatPurchaseCategoryFilters allCount={8} allLabel="Все" categories={categories} search="camera" selectedCategoryIds={categories.map((item) => item.id)} />);
    fireEvent.click(screen.getByRole("button", { name: "Video 6" }));
    expect(push).toHaveBeenLastCalledWith(`/cabinet/repeat-purchase?category=${categories[1].id}&search=camera`);
  });

  it("makes All active only with no selection and clears every category", () => {
    const { rerender } = render(<RepeatPurchaseCategoryFilters allCount={8} allLabel="Все" categories={categories} search="" selectedCategoryIds={[]} />);
    expect(screen.getByRole("button", { name: "Все 8" })).toHaveAttribute("aria-pressed", "true");
    rerender(<RepeatPurchaseCategoryFilters allCount={8} allLabel="Все" categories={categories} search="" selectedCategoryIds={categories.map((item) => item.id)} />);
    fireEvent.click(screen.getByRole("button", { name: "Все 8" }));
    expect(push).toHaveBeenLastCalledWith("/cabinet/repeat-purchase");
  });
});
