"use server";

import { revalidatePath } from "next/cache";

import { createAdminPublicPartnerDirectoryService, requireAdminPermission } from "../services";

export type AdminPublicPartnerDirectoryActionState = {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
};

export async function updateAdminPublicPartnerDirectoryAction(
  _previous: AdminPublicPartnerDirectoryActionState,
  formData: FormData,
): Promise<AdminPublicPartnerDirectoryActionState> {
  const correlationId = crypto.randomUUID();
  try {
    await requireAdminPermission("admin.catalog.manage");
    const result = await createAdminPublicPartnerDirectoryService().update({
      companyId: String(formData.get("companyId") ?? ""),
      expectedRevision: Number(formData.get("revision")),
      publicDisplayName: String(formData.get("publicDisplayName") ?? ""),
      visible: formData.get("visible") === "on",
      useCurrentLogo: formData.get("useCurrentLogo") === "on",
      correlationId,
    });
    revalidatePath("/admin/partners/public-directory");
    revalidatePath("/partners");
    return {
      status: "success",
      message: result.changed
        ? "Настройки публичной карточки сохранены."
        : "Изменений нет.",
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const conflict = code === "PUBLIC_PARTNER_DIRECTORY_CONFLICT";
    console.error({
      event: "admin_public_partner_directory_update_failed",
      correlationId,
      errorType: error instanceof Error ? error.name : typeof error,
      conflict,
    });
    return {
      status: conflict ? "conflict" : "error",
      message: messageFor(code, correlationId),
    };
  }
}

function messageFor(code: string, correlationId: string): string {
  if (code === "PUBLIC_PARTNER_DIRECTORY_CONFLICT") {
    return "Карточка уже изменена другим администратором. Обновите страницу.";
  }
  if (code === "PUBLIC_PARTNER_NAME_REQUIRED") {
    return "Укажите публичное название перед публикацией.";
  }
  if (code === "PUBLIC_PARTNER_NAME_INVALID" || code === "PUBLIC_PARTNER_INPUT_INVALID") {
    return "Проверьте публичное название и повторите попытку.";
  }
  if (code === "PUBLIC_PARTNER_COMPANY_INACTIVE") {
    return "Неактивную компанию нельзя опубликовать.";
  }
  return `Не удалось сохранить карточку. Код обращения: ${correlationId}`;
}
