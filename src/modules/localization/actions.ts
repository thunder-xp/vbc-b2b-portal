"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireAdminPermission } from "../admin/services";
import { createLocalizationService } from "./service-factory";
import type { LocalizationContent, LocalizationEntityType } from "./types";
import { PublicRetailPublicationService } from "../public-retail/services/public-retail-publication.service";
import { SupabasePublicRetailPublicationRepository } from "../public-retail/repositories/supabase/public-retail-publication.supabase-repository";

export type LocalizationActionResult = { success: true; message: string } | { success: false; message: string; code: string };

export async function saveLocalizationAction(input: {
  entityType: LocalizationEntityType; entityId: string; action: "save_draft" | "review";
  sourceHash: string; expectedRevision: number; content: LocalizationContent;
}): Promise<LocalizationActionResult> {
  try {
    const context = await requireAdminPermission("admin.catalog.manage");
    await createLocalizationService().save({ ...input, actorUserId: context.userId });
    const published = input.action === "review" ? await publishLocalizationSnapshot() : true;
    revalidatePath("/admin/content/localization");
    return { success: true, message: input.action === "review"
      ? published ? "Перевод проверен и опубликован." : "Перевод проверен. Публикация будет повторена позже."
      : "Черновик сохранён." };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "LOCALIZATION_MUTATION_FAILED";
    return { success: false, code, message: code === "PT409" ? "Источник или версия изменились. Обновите страницу." : "Не удалось сохранить локализацию." };
  }
}

export async function revertLocalizationToMachineDraftAction(input: {
  entityType: LocalizationEntityType; entityId: string; sourceHash: string; expectedRevision: number;
}): Promise<LocalizationActionResult> {
  try {
    const context = await requireAdminPermission("admin.catalog.manage");
    await createLocalizationService().save({
      ...input, action: "revert_machine_draft", actorUserId: context.userId,
      content: { localizedName: null, seoTitle: null, seoDescription: null },
    });
    const published = await publishLocalizationSnapshot();
    revalidatePath("/admin/content/localization");
    return { success: true, message: published
      ? "Восстановлен машинный черновик и опубликован."
      : "Машинный черновик восстановлен. Публикация будет повторена позже." };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "LOCALIZATION_REVERT_FAILED";
    return { success: false, code, message: code === "PT409"
      ? "Источник или версия изменились. Обновите страницу."
      : "Не удалось восстановить машинный черновик." };
  }
}

export async function requestLocalizationRetranslationAction(input: {
  entityType: LocalizationEntityType; entityId: string;
}): Promise<LocalizationActionResult> {
  try {
    const context = await requireAdminPermission("admin.catalog.manage");
    await createLocalizationService().requestRetranslation(input.entityType, input.entityId, context.userId);
    revalidatePath("/admin/content/localization");
    return { success: true, message: "Повторный перевод поставлен в очередь." };
  } catch {
    return { success: false, code: "LOCALIZATION_RETRANSLATION_FAILED", message: "Не удалось поставить перевод в очередь." };
  }
}

async function publishLocalizationSnapshot() {
  try {
    await new PublicRetailPublicationService(new SupabasePublicRetailPublicationRepository()).publishCurrentProjection();
    revalidateTag("public-retail-publication", "max");
    revalidatePath("/");
    revalidatePath("/catalog");
    revalidatePath("/products/[slug]", "page");
    return true;
  } catch {
    await createLocalizationService().requestPublication().catch(() => undefined);
    return false;
  }
}
