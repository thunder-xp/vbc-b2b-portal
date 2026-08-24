"use server";

import { revalidatePath, revalidateTag } from "next/cache";

import { requireAdminPermission } from "../admin/services";
import { createLocalizationService } from "./service-factory";
import type { LocalizationContent, LocalizationEntityType } from "./types";
import { PublicRetailPublicationService } from "../public-retail/services/public-retail-publication.service";
import { SupabasePublicRetailPublicationRepository } from "../public-retail/repositories/supabase/public-retail-publication.supabase-repository";

export type LocalizationActionResult = { success: true; message: string } | { success: false; message: string; code: string };
export type LocalizationTransferActionResult = LocalizationActionResult & {
  payload?: string;
  preview?: { validCount: number; invalidCount: number; rows: Array<{ row: number; valid: boolean; reason: string | null; sourceName: string | null }> };
};

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

export async function exportLocalizationAction(input: {
  entityType: LocalizationEntityType; status?: "missing" | "draft" | "reviewed" | "outdated"; limit?: number;
}): Promise<LocalizationTransferActionResult> {
  try {
    await requireAdminPermission("admin.catalog.manage");
    const rows = await createLocalizationService().exportRows(input);
    return { success: true, message: `Подготовлено записей: ${rows.length}.`, payload: JSON.stringify(rows, null, 2) };
  } catch {
    return { success: false, code: "LOCALIZATION_EXPORT_FAILED", message: "Не удалось подготовить экспорт." };
  }
}

export async function previewLocalizationImportAction(payload: string): Promise<LocalizationTransferActionResult> {
  try {
    await requireAdminPermission("admin.catalog.manage");
    const service = createLocalizationService();
    const preview = await service.previewImport(service.parseImport(payload));
    return { success: true, message: preview.invalidCount ? "Импорт содержит ошибки." : "Файл готов к импорту.", preview };
  } catch {
    return { success: false, code: "LOCALIZATION_IMPORT_INVALID", message: "Файл не прошёл проверку." };
  }
}

export async function importLocalizationAction(payload: string): Promise<LocalizationTransferActionResult> {
  try {
    const context = await requireAdminPermission("admin.catalog.manage");
    const service = createLocalizationService();
    const result = await service.importRows(service.parseImport(payload), context.userId);
    const published = await publishLocalizationSnapshot();
    revalidatePath("/admin/content/localization");
    return { success: true, message: published
      ? `Импортировано и опубликовано: ${result.importedCount}.`
      : `Импортировано: ${result.importedCount}. Публикация будет повторена.` };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "LOCALIZATION_IMPORT_FAILED";
    return { success: false, code, message: code === "PT409"
      ? "Исходные данные изменились. Выполните новый экспорт."
      : "Не удалось импортировать локализацию." };
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
