"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { getAuthenticatedUserId } from "../../access-control/actions/service-factory";
import { validateCompanyLogo } from "../services/company-logo.service";
import { createPartnerWorkspaceContextService } from "./service-factory";

export type CompanyLogoActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export async function updateCompanyLogoAction(
  _state: CompanyLogoActionState,
  formData: FormData,
): Promise<CompanyLogoActionState> {
  let uploadedPath: string | null = null;
  try {
    const userId = await getAuthenticatedUserId();
    const context = await createPartnerWorkspaceContextService().getWorkspaceContext(userId);
    if (!context.companyId || !context.canManageCompanyLogo) {
      return failure("Изменять логотип может только владелец компании.");
    }

    const remove = formData.get("intent") === "remove";
    if (!remove) {
      const file = formData.get("logo");
      if (!(file instanceof File)) return failure("Выберите файл логотипа.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const extension = validateCompanyLogo(bytes, file.type);
      uploadedPath = `${context.companyId}/${randomUUID()}.${extension}`;
      const { error } = await createAdminClient().storage
        .from("company-logos")
        .upload(uploadedPath, bytes, { contentType: file.type, upsert: false });
      if (error) return failure("Не удалось загрузить логотип. Повторите попытку.");
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("set_partner_company_logo", {
      p_company_id: context.companyId,
      p_logo_asset_path: uploadedPath,
    });
    if (error) {
      if (uploadedPath) await createAdminClient().storage.from("company-logos").remove([uploadedPath]);
      return failure("Не удалось сохранить логотип. Повторите попытку.");
    }

    if (context.companyLogoAssetPath && context.companyLogoAssetPath !== uploadedPath) {
      await createAdminClient().storage.from("company-logos").remove([context.companyLogoAssetPath]);
    }
    revalidatePath("/cabinet", "layout");
    return {
      status: "success",
      message: remove ? "Логотип удалён." : "Логотип компании обновлён.",
    };
  } catch (error) {
    if (uploadedPath) await createAdminClient().storage.from("company-logos").remove([uploadedPath]);
    if (error instanceof Error && error.message === "COMPANY_LOGO_SIZE") {
      return failure("Размер логотипа не должен превышать 2 МБ.");
    }
    if (error instanceof Error && error.message === "COMPANY_LOGO_FORMAT") {
      return failure("Используйте PNG, JPG или WEBP без изменения расширения файла.");
    }
    return failure("Не удалось обновить логотип. Повторите попытку.");
  }
}

function failure(message: string): CompanyLogoActionState {
  return { status: "error", message };
}
