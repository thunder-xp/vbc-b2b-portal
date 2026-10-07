import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "../../../platform-ui";
import { PartnerFeedback } from "../PartnerFeedback";

const read = (path: string) => readFileSync(resolve(path), "utf8");

describe("Partner feedback visual standard", () => {
  it.each([
    ["info", "status"],
    ["success", "status"],
    ["warning", "status"],
    ["error", "alert"],
  ] as const)("renders %s feedback with accessible semantics", (kind, role) => {
    const { container } = render(<PartnerFeedback kind={kind}>Message</PartnerFeedback>);

    expect(screen.getByRole(role)).toHaveAttribute("data-partner-feedback", kind);
    expect(container.querySelector("[data-partner-feedback-icon]")).toBeInTheDocument();
  });

  it("renders the compact empty-state structure and optional action", () => {
    const { container } = render(<EmptyState actionHref="/cabinet/catalog" actionLabel="Open" message="Nothing here." title="Empty" />);

    expect(container.querySelector("[data-ui-empty-state]")).toBeInTheDocument();
    expect(container.querySelector("[data-ui-empty-state-title]")).toHaveTextContent("Empty");
    expect(container.querySelector("[data-ui-empty-state-body]")).toHaveTextContent("Nothing here.");
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("data-ui-empty-state-action");
  });

  it("defines the canonical compact geometry and existing semantic palette", () => {
    const styles = read("src/modules/partner-cabinet/components/PartnerFeedbackStandard.module.css");

    expect(styles).toContain("gap: 8px");
    expect(styles).toContain("padding: 12px");
    expect(styles).toContain("font-size: 12px");
    expect(styles).toContain("font-size: 11px");
    expect(styles).toContain('[data-partner-feedback="info"]');
    expect(styles).toContain('[data-partner-feedback="success"]');
    expect(styles).toContain('[data-partner-feedback="warning"]');
    expect(styles).toContain('[data-partner-feedback="error"]');
  });

  it("keeps conditions intact and removes the persistent visible kit-save helper", () => {
    const orders = read("app/(partner)/cabinet/orders/page.tsx");
    const installation = read("app/(partner)/cabinet/installation-marketplace/page.tsx");
    const kitSave = read("src/modules/purchasing-lists/components/SaveLiveSelectionAsKitButton.tsx");

    expect(orders).toContain('result.data.bootstrapState.status !== "succeeded"');
    expect(installation).toContain('state.status === "REJECTED"');
    expect(installation).toContain('state.status === "SUSPENDED"');
    expect(kitSave).toContain('className="sr-only" data-transient-success-feedback');
  });
});
