import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "../page";

describe("landing page", () => {
  it("presents the product and the two public entry actions", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { name: "Novotech Partner Platform" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign In" })).toHaveAttribute(
      "href",
      "/auth/sign-in",
    );
    expect(screen.getByRole("link", { name: "Become a Partner" })).toHaveAttribute(
      "href",
      "/auth/register",
    );
    expect(screen.getByText("B2B catalog")).toBeInTheDocument();
    expect(screen.getByText("Partner prices")).toBeInTheDocument();
    expect(screen.getByText("Stock visibility")).toBeInTheDocument();
    expect(screen.getByText("Online orders")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
  });
});
