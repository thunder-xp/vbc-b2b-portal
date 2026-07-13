"use server";

import { revalidatePath } from "next/cache";

import {
  type ActionResult,
  failureFromError,
  invalidInput,
  success,
} from "../../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import type {
  InternalSpecificationDetailDto,
  InternalSpecificationSummaryDto,
} from "../services";
import { ProjectSpecificationStatus } from "../types";
import { createInternalSpecificationReviewService } from "./service-factory";

export async function listInternalSpecificationsAction(): Promise<ActionResult<InternalSpecificationSummaryDto[]>> {
  try {
    const userId = await getAuthenticatedUserId();
    return success(
      "Submitted specifications loaded.",
      await createInternalSpecificationReviewService().listForReview(userId),
    );
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getInternalSpecificationAction(
  specificationId: string,
): Promise<ActionResult<InternalSpecificationDetailDto>> {
  if (!specificationId.trim()) return invalidInput("Specification is required.");
  try {
    const userId = await getAuthenticatedUserId();
    return success(
      "Specification loaded.",
      await createInternalSpecificationReviewService().getForReview(userId, specificationId),
    );
  } catch (error) {
    return failureFromError(error);
  }
}

export async function startSpecificationReviewAction(
  specificationId: string,
): Promise<ActionResult<null>> {
  if (!specificationId.trim()) return invalidInput("Specification is required.");
  try {
    const userId = await getAuthenticatedUserId();
    await createInternalSpecificationReviewService().startReview(userId, specificationId);
    revalidateReviewPaths(specificationId);
    return success("Specification review started.", null);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function decideSpecificationReviewAction(input: {
  specificationId?: string | null;
  status?: string | null;
  comment?: string | null;
}): Promise<ActionResult<{ revisionId: string | null }>> {
  const specificationId = input.specificationId?.trim() ?? "";
  const comment = input.comment?.trim() ?? "";
  const allowedStatuses = [
    ProjectSpecificationStatus.Approved,
    ProjectSpecificationStatus.ChangesRequested,
    ProjectSpecificationStatus.Rejected,
  ] as const;
  const status = allowedStatuses.find((candidate) => candidate === input.status);
  if (!specificationId || !status || !comment || comment.length > 2000) {
    return invalidInput("A valid decision and response comment are required.");
  }
  try {
    const userId = await getAuthenticatedUserId();
    const result = await createInternalSpecificationReviewService().decide(userId, {
      specificationId,
      status,
      comment,
    });
    revalidateReviewPaths(specificationId);
    if (result.revisionId) revalidatePath(`/cabinet/specifications/${result.revisionId}`);
    return success("Specification review decision saved.", result);
  } catch (error) {
    return failureFromError(error);
  }
}

function revalidateReviewPaths(specificationId: string): void {
  revalidatePath("/admin/specifications");
  revalidatePath(`/admin/specifications/${specificationId}`);
  revalidatePath("/cabinet/specifications");
  revalidatePath(`/cabinet/specifications/${specificationId}`);
}
