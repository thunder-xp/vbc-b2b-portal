import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminIntegrationCenterView } from "../AdminIntegrationViews";

describe("AdminIntegrationCenterView", () => {
  it("shows price publication delta and runtime headroom on the active admin surface", () => {
    render(<AdminIntegrationCenterView center={{ locks: [], domains: [{
      domain: "prices",
      status: "succeeded",
      lastAttemptAt: "2026-09-14T12:33:21.146Z",
      lastSuccessAt: "2026-09-14T12:36:56.476Z",
      durationMs: 215_330,
      received: 38_680,
      published: 0,
      excluded: 4_823,
      safeErrorCode: null,
      runId: null,
      pricePublication: {
        stagedRows: 31_324,
        unchanged: 7_243,
        inserted: 0,
        updated: 0,
        removed: 0,
        batches: 1,
        databaseDurationMs: 1_239,
        timeoutBudgetMs: 8_000,
        headroomPercent: 84.51,
        warning: false,
      },
    }] }} />);

    expect(screen.getByRole("region", { name: "Диагностика публикации цен" })).toHaveTextContent("31324");
    expect(screen.getByText("Без изменений")).toBeInTheDocument();
    expect(screen.getByText("7243")).toBeInTheDocument();
    expect(screen.getByText("1239 ms")).toBeInTheDocument();
    expect(screen.getByText("84.51%")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("warns when publication consumes more than seventy percent of the timeout", () => {
    render(<AdminIntegrationCenterView center={{ locks: [], domains: [{
      domain: "prices",
      status: "succeeded",
      lastAttemptAt: null,
      lastSuccessAt: null,
      durationMs: null,
      received: 0,
      published: 0,
      excluded: 0,
      safeErrorCode: null,
      runId: null,
      pricePublication: {
        stagedRows: 0,
        unchanged: 0,
        inserted: 0,
        updated: 0,
        removed: 0,
        batches: 1,
        databaseDurationMs: 5_700,
        timeoutBudgetMs: 8_000,
        headroomPercent: 28.75,
        warning: true,
      },
    }] }} />);

    expect(screen.getByRole("alert")).toHaveTextContent("более 70%");
  });
});
