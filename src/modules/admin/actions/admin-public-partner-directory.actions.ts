"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { validateCompanyLogo } from "@/src/modules/company-identity/company-logo";

import { createAdminPublicPartnerDirectoryService, requireAdminPermission } from "../services";

export type AdminPublicPartnerDirectoryActionState = {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
};

export type AdminCompanyLogoActionState = {
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

export async function updateAdminCompanyLogoAction(
  _previous: AdminCompanyLogoActionState,
  formData: FormData,
): Promise<AdminCompanyLogoActionState> {
  const correlationId = crypto.randomUUID();
  let uploadedPath: string | null = null;
  let adminClient: ReturnType<typeof createAdminClient> | null = null;
  try {
    await requireAdminPermission("admin.catalog.manage");
    const companyId = String(formData.get("companyId") ?? "");
    const expectedRevision = Number(formData.get("revision"));
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(companyId)
      || !Number.isInteger(expectedRevision) || expectedRevision < 1) {
      throw new Error("ADMIN_COMPANY_LOGO_INPUT_INVALID");
    }
    const remove = formData.get("intent") === "remove";
    adminClient = createAdminClient();
    if (!remove) {
      const file = formData.get("logo");
      if (!(file instanceof File)) throw new Error("ADMIN_COMPANY_LOGO_FILE_REQUIRED");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const extension = validateCompanyLogo(bytes, file.type, file.name);
      uploadedPath = `${companyId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await adminClient.storage
        .from("company-logos")
        .upload(uploadedPath, bytes, { contentType: file.type, upsert: false });
      if (error) throw new Error("ADMIN_COMPANY_LOGO_UPLOAD_FAILED");
    }

    const result = await createAdminPublicPartnerDirectoryService().updateLogo({
      companyId,
      expectedRevision,
      logoAssetPath: uploadedPath,
      correlationId,
    });
    uploadedPath = null;

    if (result.changed && result.previousLogoAssetPath
      && result.previousLogoAssetPath !== result.logoAssetPath) {
      const { error } = await adminClient.storage
        .from("company-logos")
        .remove([result.previousLogoAssetPath]);
      if (error) {
        console.warn({
          event: "admin_company_logo_obsolete_asset_cleanup_failed",
          companyId: result.companyId,
          correlationId,
        });
      }
    }

    try {
      revalidatePath("/admin/partners/public-directory");
      revalidatePath("/partners");
      revalidatePath("/cabinet", "layout");
    } catch {
      console.warn({
        event: "admin_company_logo_revalidation_failed",
        companyId: result.companyId,
        correlationId,
      });
    }
    return {
      status: "success",
      message: result.changed
        ? result.logoAssetPath ? "Логотип компании обновлён." : "Логотип компании удалён."
        : "Изменений нет.",
    };
  } catch (error) {
    if (uploadedPath && adminClient) {
      const { error: cleanupError } = await adminClient.storage.from("company-logos").remove([uploadedPath]);
      if (cleanupError) {
        console.warn({ event: "admin_company_logo_orphan_cleanup_failed", correlationId });
      }
    }
    const code = error instanceof Error ? error.message : "";
    const conflict = code === "ADMIN_COMPANY_LOGO_CONFLICT";
    console.error({
      event: "admin_company_logo_update_failed",
      correlationId,
      errorType: error instanceof Error ? error.name : typeof error,
      conflict,
    });
    return {
      status: conflict ? "conflict" : "error",
      message: companyLogoMessageFor(code, correlationId),
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

function companyLogoMessageFor(code: string, correlationId: string): string {
  if (code === "ADMIN_COMPANY_LOGO_CONFLICT") {
    return "Логотип уже изменён другим администратором. Обновите страницу.";
  }
  if (code === "COMPANY_LOGO_SIZE") {
    return "Размер логотипа не должен превышать 2 МБ.";
  }
  if (code === "COMPANY_LOGO_FORMAT") {
    return "Используйте PNG, JPG или WebP с корректным расширением файла.";
  }
  if (code === "ADMIN_COMPANY_LOGO_FILE_REQUIRED") {
    return "Выберите файл логотипа.";
  }
  if (code === "ADMIN_COMPANY_LOGO_COMPANY_INACTIVE") {
    return "Логотип неактивной компании изменить нельзя.";
  }
  return `Не удалось обновить логотип. Код обращения: ${correlationId}`;
}
