import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminSyncControls } from "../AdminSyncControls";

const mocks = vi.hoisted(() => ({ runAdminSyncAction: vi.fn() }));

vi.mock("../../actions", () => ({
  runAdminSyncAction: mocks.runAdminSyncAction,
}));

describe("AdminSyncControls", () => {
  beforeEach(() => {
    mocks.runAdminSyncAction.mockReset();
  });

  it("reports every unified catalog synchronization stage", async () => {
    mocks.runAdminSyncAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "Catalog synchronization completed.",
      data: {
        domain: "catalog",
        catalog: {
          runId: "60ff102a-e321-4aaf-83b8-073dac2027e9",
          sourceB2BStatus: "succeeded",
          publicRetailProjectionStatus: "succeeded",
          publicRetailPublicationStatus: "succeeded",
          overallStatus: "succeeded",
          publicationId: "0848cef5-a398-4b55-91f0-2066e6bdee9f",
          checksum: "checksum",
          sourceDurationMs: 6370,
          publicRetailDurationMs: 1999,
        },
      },
    });

    const user = userEvent.setup();
    render(<AdminSyncControls />);
    await user.type(screen.getByLabelText("Причина запуска"), "Контрольная приемка");
    await user.click(screen.getByRole("button", { name: "Каталог" }));

    const result = await screen.findByTestId("catalog-sync-stage-result");
    expect(result).toHaveTextContent("Источник / B2B");
    expect(result).toHaveTextContent("Public Retail projection");
    expect(result).toHaveTextContent("Public Retail publication");
    expect(result).toHaveTextContent("Общий результат");
    expect(screen.getAllByText("Завершено")).toHaveLength(4);
  });
});
