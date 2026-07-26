"use server";

import {
  failureFromError,
  success,
  type ActionResult,
} from "../../access-control/actions/action-result";
import { requireAdminPermission } from "../../admin/services";
import { getOneCEnv } from "../../../lib/env";
import { recordOneCHealthAudit } from "../providers/one-c/one-c-health-audit.repository";
import {
  runOneCODataHealthCheck,
  type OneCHealthReport,
} from "../providers/one-c/one-c-health-check";

export async function runOneCHealthCheckAction(): Promise<ActionResult<OneCHealthReport>> {
  try {
    await requireAdminPermission("admin.diagnostics.run");
    const startedAt = performance.now();
    const report = await runOneCODataHealthCheck(getOneCEnv());
    const passed = [
      report.metadata.passed,
      report.minimalQuery.passed,
      report.nameQuery.passed,
      report.provider.passed,
    ].every(Boolean);

    await recordOneCHealthAudit(
      passed ? "passed" : "failed",
      performance.now() - startedAt,
    );

    return success("1C OData diagnostics completed.", report);
  } catch (error) {
    return failureFromError(error);
  }
}
