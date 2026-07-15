import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpandableDescription } from "../ExpandableDescription";

let resize: (() => void) | undefined;
beforeEach(() => {
  resize = undefined;
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} });
});

describe("ExpandableDescription", () => {
  it("clamps to 9 lines and expands and collapses accessibly when content overflows", () => {
    Object.defineProperties(HTMLParagraphElement.prototype, { scrollHeight: { configurable: true, get: () => 400 }, clientHeight: { configurable: true, get: () => 200 } });
    render(<ExpandableDescription text="Long description" />);
    act(() => resize?.());
    const button = screen.getByRole("button", { name: "Подробнее…" });
    expect(screen.getByText("Long description")).toHaveClass("line-clamp-[9]", "text-sm", "leading-[1.5]");
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Свернуть" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Свернуть" }));
    expect(screen.getByRole("button", { name: "Подробнее…" })).toHaveAttribute("aria-expanded", "false");
  });

  it("hides the control when short text fits", () => {
    Object.defineProperties(HTMLParagraphElement.prototype, { scrollHeight: { configurable: true, get: () => 100 }, clientHeight: { configurable: true, get: () => 100 } });
    render(<ExpandableDescription text="Short" />);
    act(() => resize?.());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
