import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminPermission: vi.fn(),
  runHealthCheck: vi.fn(),
  discoverCommercialRateSources: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("../../../admin/services", () => ({
  requireAdminPermission: mocks.requireAdminPermission,
}));
vi.mock("../../../../lib/env", () => ({
  getOneCEnv: () => ({ baseUrl: "https://erp.example" }),
}));
vi.mock("../../providers/one-c/one-c-health-audit.repository", () => ({
  recordOneCHealthAudit: mocks.recordAudit,
}));
vi.mock("../../providers/one-c/one-c-health-check", () => ({
  runOneCODataHealthCheck: mocks.runHealthCheck,
}));
vi.mock("../../providers/one-c/one-c-commercial-rate-discovery", () => ({
  discoverOneCCommercialRateSources: mocks.discoverCommercialRateSources,
}));

import { PermissionRequiredError } from "../../../access-control/services";
import {
  runOneCCommercialRateDiscoveryAction,
  runOneCHealthCheckAction,
} from "../one-c-health.action";

const report = {
  metadata: { passed: true },
  minimalQuery: { passed: true },
  nameQuery: { passed: true },
  provider: { passed: true },
};

describe("runOneCHealthCheckAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminPermission.mockResolvedValue({});
    mocks.runHealthCheck.mockResolvedValue(report);
    mocks.recordAudit.mockResolvedValue(undefined);
  });

  it("requires the dedicated diagnostic permission and audits execution", async () => {
    const result = await runOneCHealthCheckAction();

    expect(result.success).toBe(true);
    expect(mocks.requireAdminPermission).toHaveBeenCalledWith(
      "admin.diagnostics.run",
    );
    expect(mocks.runHealthCheck).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      "passed",
      expect.any(Number),
    );
  });

  it("does not contact 1C when permission is missing", async () => {
    mocks.requireAdminPermission.mockRejectedValue(
      new PermissionRequiredError(),
    );

    const result = await runOneCHealthCheckAction();

    expect(result.success).toBe(false);
    expect(mocks.runHealthCheck).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

describe("runOneCCommercialRateDiscoveryAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminPermission.mockResolvedValue({});
    mocks.discoverCommercialRateSources.mockResolvedValue({
      correlationId: "correlation",
    });
  });

  it("requires internal diagnostic permission before contacting 1C", async () => {
    const result = await runOneCCommercialRateDiscoveryAction();

    expect(result.success).toBe(true);
    expect(mocks.requireAdminPermission).toHaveBeenCalledWith(
      "admin.diagnostics.run",
    );
    expect(mocks.discoverCommercialRateSources).toHaveBeenCalledTimes(1);
  });

  it("does not contact 1C when permission is missing", async () => {
    mocks.requireAdminPermission.mockRejectedValue(
      new PermissionRequiredError(),
    );

    const result = await runOneCCommercialRateDiscoveryAction();

    expect(result.success).toBe(false);
    expect(mocks.discoverCommercialRateSources).not.toHaveBeenCalled();
  });
});
