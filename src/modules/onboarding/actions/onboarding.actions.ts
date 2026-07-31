"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getOneCEnv } from "@/src/lib/env";
import { createClient } from "@/src/lib/supabase/server";
import {
  failureFromError,
  success,
  type ActionResult,
} from "@/src/modules/access-control/actions/action-result";
import { requireAdminPermission } from "@/src/modules/admin/services";

import { ONBOARDING_STATUSES, type OnboardingDetail, type OnboardingQueue } from "../types";
import { SupabaseOnboardingRepository, type OnboardingQueueInput } from "../repositories";
import {
  CounterpartyDirectorySyncService,
  OneCCounterpartyDirectorySource,
} from "../services";

const uuidSchema = z.string().uuid();
const transitionSchema = z.enum(ONBOARDING_STATUSES);
const accessProfileSchema = z.enum([
  "owner",
  "manager",
  "buyer",
  "accounting",
  "retail_only",
]);

export async function listOnboardingQueueAction(
  input: OnboardingQueueInput,
): Promise<ActionResult<OnboardingQueue>> {
  try {
    await requireAdminPermission("onboarding.requests.view");
    const queue = await new SupabaseOnboardingRepository().listQueue(input);
    return success("Очередь онбординга загружена.", queue);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function getOnboardingDetailAction(
  requestId: string,
): Promise<ActionResult<OnboardingDetail | null>> {
  try {
    await requireAdminPermission("onboarding.requests.view");
    const detail = await new SupabaseOnboardingRepository().getDetail(
      uuidSchema.parse(requestId),
    );
    return success("Заявка загружена.", detail);
  } catch (error) {
    return failureFromError(error);
  }
}

export async function assignOnboardingRequestFormAction(
  formData: FormData,
): Promise<void> {
  await requireAdminPermission("onboarding.requests.assign");
  const requestId = uuidSchema.parse(formData.get("requestId"));
  const assigneeValue = formData.get("assigneeUserId");
  let assigneeUserId: string;
  if (assigneeValue === "self") {
    const client = await createClient();
    const { data } = await client.auth.getUser();
    assigneeUserId = uuidSchema.parse(data.user?.id);
  } else {
    assigneeUserId = uuidSchema.parse(assigneeValue);
  }
  await new SupabaseOnboardingRepository().assign(requestId, assigneeUserId);
  revalidateOnboarding(requestId);
}

export async function unassignOnboardingRequestFormAction(
  formData: FormData,
): Promise<void> {
  await requireAdminPermission("onboarding.requests.assign");
  const requestId = uuidSchema.parse(formData.get("requestId"));
  await new SupabaseOnboardingRepository().unassign(requestId);
  revalidateOnboarding(requestId);
}

export async function transitionOnboardingRequestFormAction(
  formData: FormData,
): Promise<void> {
  await requireAdminPermission("onboarding.requests.review");
  const requestId = uuidSchema.parse(formData.get("requestId"));
  const nextStatus = transitionSchema.parse(formData.get("nextStatus"));
  const reason = String(formData.get("reason") ?? "").trim() || null;
  await new SupabaseOnboardingRepository().transition(
    requestId,
    nextStatus,
    reason,
  );
  revalidateOnboarding(requestId);
}

export async function confirmOnboardingMatchFormAction(
  formData: FormData,
): Promise<void> {
  await requireAdminPermission("onboarding.company_match.confirm");
  const requestId = uuidSchema.parse(formData.get("requestId"));
  const counterpartyId = uuidSchema.parse(formData.get("counterpartyId"));
  const initialAccessProfile = accessProfileSchema.parse(
    formData.get("initialAccessProfile"),
  );
  await new SupabaseOnboardingRepository().confirmMatch(
    requestId,
    counterpartyId,
    initialAccessProfile,
  );
  revalidateOnboarding(requestId);
}

export async function synchronizeCounterpartyDirectoryFormAction(): Promise<void> {
  await requireAdminPermission("admin.integrations.manage");
  const service = new CounterpartyDirectorySyncService(
    new OneCCounterpartyDirectorySource(getOneCEnv()),
  );
  await service.synchronize();
  revalidatePath("/admin/onboarding");
}

export async function openOnboardingRequestFormAction(
  formData: FormData,
): Promise<void> {
  redirect(`/admin/onboarding/${uuidSchema.parse(formData.get("requestId"))}`);
}

function revalidateOnboarding(requestId: string): void {
  revalidatePath("/admin/onboarding");
  revalidatePath(`/admin/onboarding/${requestId}`);
}
