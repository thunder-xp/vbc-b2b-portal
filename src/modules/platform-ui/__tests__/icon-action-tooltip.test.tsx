import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { IconActionTooltip } from "../IconActionTooltip";

describe("IconActionTooltip", () => {
  it("links an icon-only action to its keyboard and hover tooltip", () => {
    render(<IconActionTooltip label="Удалить"><button aria-label="Удалить" type="button">X</button></IconActionTooltip>);

    const button = screen.getByRole("button", { name: "Удалить" });
    const tooltip = screen.getByRole("tooltip");
    expect(button).toHaveAttribute("aria-describedby", tooltip.id);
    expect(tooltip).toHaveTextContent("Удалить");
    expect(tooltip).toHaveClass("group-hover:block", "group-focus-within:block");
  });
});
