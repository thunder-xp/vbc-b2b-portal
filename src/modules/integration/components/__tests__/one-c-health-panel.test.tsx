import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runOneCHealthCheckAction: vi.fn(),
  runOneCCommercialRateDiscoveryAction: vi.fn(),
  runOneCRelationMetadataAuditAction: vi.fn(),
  runOneCServiceMetadataAuditAction: vi.fn(),
  runOneCServiceSourceAuditAction: vi.fn(),
}));

vi.mock("../../actions", () => ({
  runOneCHealthCheckAction: mocks.runOneCHealthCheckAction,
  runOneCCommercialRateDiscoveryAction:
    mocks.runOneCCommercialRateDiscoveryAction,
  runOneCRelationMetadataAuditAction: mocks.runOneCRelationMetadataAuditAction,
  runOneCServiceMetadataAuditAction: mocks.runOneCServiceMetadataAuditAction,
  runOneCServiceSourceAuditAction: mocks.runOneCServiceSourceAuditAction,
}));

import type { OneCHealthReport } from "../../providers/one-c/one-c-health-check";
import { OneCHealthPanel } from "../OneCHealthPanel";

const configuration = {
  checks: [{ variable: "ONEC_BASE_URL", configured: true }],
  baseHost: "erp.example",
  authMode: "basic",
  timeoutMs: 10_000,
};

const check = {
  passed: true,
  statusCode: 200,
  contentType: "application/json",
  durationMs: 10,
  hostname: "erp.example",
  errorCategory: null,
  message: null,
};

const report: OneCHealthReport = {
  configuration,
  metadata: check,
  minimalQuery: {
    ...check,
    jsonParsed: true,
    valueArray: true,
    rowCount: 1,
  },
  nameQuery: {
    ...check,
    valueArray: true,
    rowCount: 2,
    validMappedRowCount: 2,
    skippedRowCount: 0,
    validationFailures: [],
  },
  provider: {
    passed: true,
    resultCount: 2,
    providerOutputShape: "integration_page_result",
    providerOutputCount: 2,
    serviceOutputShape: "integration_page_result",
    serviceOutputCount: 2,
    failedStage: null,
    issuePaths: [],
    receivedContentType: null,
    requestKind: null,
    resourceName: null,
    queryParameterNames: [],
    statusCode: null,
    jsonParseFailure: false,
    parseErrorName: null,
    bodyLength: null,
    bomDetected: false,
    emptyBody: false,
    errorType: null,
    errorName: null,
    errorCategory: null,
    message: "Provider lookup completed.",
  },
};

describe("OneCHealthPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runOneCHealthCheckAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "done",
      data: report,
    });
    mocks.runOneCCommercialRateDiscoveryAction.mockResolvedValue({
      success: true,
      errorCode: null,
      message: "done",
      data: {
        correlationId: "correlation",
        generatedAt: "2026-09-01T00:00:00.000Z",
        metadata: { entityCount: 1, relevantEntities: [], truncated: false },
        probes: [],
        requestCount: 1,
        durationMs: 10,
      },
    });
  });

  it("does not run live diagnostics while rendering", () => {
    renderPanel();

    expect(mocks.runOneCHealthCheckAction).not.toHaveBeenCalled();
    expect(
      screen.queryByTestId("one-c-live-diagnostic-result"),
    ).not.toBeInTheDocument();
  });

  it("runs diagnostics only after the explicit button is selected", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(
      screen.getByRole("button", { name: "Запустить диагностику" }),
    );

    expect(mocks.runOneCHealthCheckAction).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByTestId("one-c-live-diagnostic-result"),
    ).toBeInTheDocument();
  });

  it("runs commercial-rate discovery only after the explicit internal action", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(mocks.runOneCCommercialRateDiscoveryAction).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Временно: найти источники курсов" }),
    );

    expect(mocks.runOneCCommercialRateDiscoveryAction).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByTestId("one-c-commercial-rate-discovery"),
    ).toBeInTheDocument();
  });
});

function renderPanel() {
  render(
    <OneCHealthPanel
      configuration={configuration}
      deployment={{
        diagnosticVersion: "test",
        commitSha: "abcdef0",
        deploymentId: "deployment",
      }}
    />,
  );
}
