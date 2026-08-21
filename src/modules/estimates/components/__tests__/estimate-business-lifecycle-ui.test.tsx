import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EstimateLifecycleStatus } from "../../types";
import { EstimateStatusBadge } from "../EstimateStatusBadge";

describe("estimate lifecycle presentation", () => {
  it.each([
    ["draft", "Черновик"],
    ["sent", "Отправлено"],
    ["accepted", "Принято"],
    ["rejected", "Отклонено"],
    ["expired", "Срок истёк"],
    ["converted_to_order", "Переведено в заказ"],
  ] satisfies Array<[EstimateLifecycleStatus, string]>)("renders %s as %s", (status, label) => {
    render(<EstimateStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeVisible();
  });

  it("renders the Romanian status without requiring a client locale provider", () => {
    render(<EstimateStatusBadge locale="ro" status="accepted" />);

    expect(screen.getByText("Acceptat")).toBeVisible();
    expect(screen.getByLabelText("Statut: Acceptat")).toBeVisible();
  });
});
