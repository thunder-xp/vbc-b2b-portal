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

  it("shows stock and arrivals publication deltas on the active admin surface", () => {
    render(<AdminIntegrationCenterView center={{ locks: [], domains: [{
      domain: "stock",
      status: "succeeded",
      lastAttemptAt: "2026-09-14T15:28:30.605Z",
      lastSuccessAt: "2026-09-14T15:28:30.605Z",
      durationMs: 577,
      received: 1_253,
      published: 7,
      excluded: 652,
      safeErrorCode: null,
      runId: "ff780eff-44ba-42de-9c5b-fa5a0c7db02e",
      stockPublication: {
        stockReceived: 1_253,
        arrivalsReceived: 159,
        sourceCalls: 8,
        stockStagedRows: 1_253,
        arrivalsStagedRows: 130,
        stockDelta: { unchanged: 549, inserted: 0, updated: 7, removed: 0 },
        arrivalsDelta: { unchanged: 0, inserted: 0, updated: 0, removed: 0 },
        databaseDurationMs: 415,
        applicationDurationMs: 577,
        timeoutBudgetMs: 8_000,
        headroomPercent: 94.81,
        lockWaitMs: 0,
        triggerRows: 7,
        triggerDurationMs: null,
        sqlState: null,
        failedStage: null,
        recoveryState: "CONFIRMED_PUBLICATION_ACTIVE",
        affectedDomains: ["stock", "arrivals"],
        warning: false,
      },
    }] }} />);

    const region = screen.getByRole("region", {
      name: "Диагностика публикации остатков и поступлений",
    });
    expect(region).toHaveTextContent("1253 / 159");
    expect(region).toHaveTextContent("=549 +0 ~7 -0");
    expect(region).toHaveTextContent("415 ms / 577 ms");
    expect(region).toHaveTextContent("94.81%");
    expect(region).toHaveTextContent("stock, arrivals");
  });
});
