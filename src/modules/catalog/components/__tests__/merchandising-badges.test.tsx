import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MerchandisingBadges } from "../MerchandisingBadges";

describe("MerchandisingBadges", () => {
  it("uses partner-facing labels and renders at most two", () => {
    render(<MerchandisingBadges labels={["NEW", "TOP", "HOT"]} />);
    expect(screen.getByText("Новинка")).toBeInTheDocument();
    expect(screen.getByText("Популярный")).toBeInTheDocument();
    expect(screen.queryByText("Горячая цена")).not.toBeInTheDocument();
  });

  it("renders nothing without active labels", () => {
    const { container } = render(<MerchandisingBadges />);
    expect(container).toBeEmptyDOMElement();
  });
});
