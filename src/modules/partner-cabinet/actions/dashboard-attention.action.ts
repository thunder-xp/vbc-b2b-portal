"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { createWorkspaceHomeService } from "./service-factory";

export async function dismissDashboardAttentionAction(formData: FormData): Promise<void> {
  const input = z.object({
    itemId: z.string().uuid(),
    sourceFingerprint: z.string().regex(/^[0-9a-f]{32}$/),
  }).safeParse({
    itemId: String(formData.get("itemId") ?? ""),
    sourceFingerprint: String(formData.get("sourceFingerprint") ?? ""),
  });
  if (!input.success) return;

  const userId = await getAuthenticatedUserId();
  await createWorkspaceHomeService().dismissAttention(
    userId,
    input.data.itemId,
    input.data.sourceFingerprint,
  );
  revalidatePath("/cabinet");
}
