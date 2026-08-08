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
import {
  auditOneCRelationMetadata,
  type OneCRelationMetadataAudit,
} from "../providers/one-c/one-c-relation-metadata-audit";
import {
  auditOneCServiceMetadata,
  type OneCServiceMetadataAudit,
} from "../providers/one-c/one-c-service-metadata-audit";

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

export async function runOneCRelationMetadataAuditAction(): Promise<
  ActionResult<OneCRelationMetadataAudit>
> {
  try {
    await requireAdminPermission("admin.diagnostics.run");
    return success(
      "1C relation metadata inventory completed.",
      await auditOneCRelationMetadata(getOneCEnv()),
    );
  } catch (error) {
    return failureFromError(error);
  }
}

export async function runOneCServiceMetadataAuditAction(): Promise<
  ActionResult<OneCServiceMetadataAudit>
> {
  try {
    await requireAdminPermission("admin.diagnostics.run");
    return success(
      "1C service metadata inventory completed.",
      await auditOneCServiceMetadata(getOneCEnv()),
    );
  } catch (error) {
    return failureFromError(error);
  }
}
