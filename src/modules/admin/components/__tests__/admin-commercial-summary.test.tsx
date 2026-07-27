import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminCommercialSummaryView } from "../AdminCommercialSummary";

describe("AdminCommercialSummaryView", () => {
  it("contains long metric values inside their grid card", () => {
    render(
      <AdminCommercialSummaryView
        summary={{
          domain: "arrivals",
          metrics: {
            "Последняя публикация": "2026-07-27T12:34:56.789+00:00",
          },
          records: [],
        }}
      />,
    );

    expect(screen.getByText("2026-07-27T12:34:56.789+00:00")).toHaveClass(
      "break-words",
    );
  });
});
