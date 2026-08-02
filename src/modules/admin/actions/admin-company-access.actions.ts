"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createAdminCompanyService, requireAdminPermission } from "../services";

export type CompanyAccessActionState = {
  status: "idle" | "success" | "error" | "conflict";
  message: string;
  correlationId: string | null;
};

export async function updateAdminCompanyAccessAction(
  _previous: CompanyAccessActionState,
  formData: FormData,
): Promise<CompanyAccessActionState> {
  const correlationId = crypto.randomUUID();
  const companyId = String(formData.get("companyId") ?? "");
  const canonicalPath = `/admin/companies/${companyId}`;
  const alternatePath = `/admin/partners/companies/${companyId}`;
  const requestedReturnPath = String(formData.get("returnPath") ?? "");
  const returnPath = requestedReturnPath === alternatePath ? alternatePath : canonicalPath;
  try {
    await requireAdminPermission("admin.permissions.manage");
    await createAdminCompanyService().updateAccess({
      companyId,
      expectedVersion: Number(formData.get("version")),
      presetCode: String(formData.get("presetCode") ?? ""),
      enabledPermissionCodes: formData.getAll("capabilities").map(String),
      note: String(formData.get("note") ?? ""),
      correlationId,
    });
    revalidatePath(`/admin/companies/${companyId}`);
    revalidatePath(`/admin/partners/companies/${companyId}`);
    return { status: "success", message: "Доступ компании сохранён.", correlationId: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const conflict = message.includes("stale_company_access_version");
    console.error({
      event: "admin_company_access_update_failed",
      errorType: error instanceof Error ? error.name : typeof error,
      correlationId,
      conflict,
    });
    if (conflict) {
      const separator = returnPath === canonicalPath ? "?tab=access&" : "?";
      redirect(`${returnPath}${separator}accessConflict=1`);
    }
    return {
      status: conflict ? "conflict" : "error",
      message: conflict
        ? "Доступ уже изменён другим администратором. Обновите страницу и повторите попытку."
        : `Не удалось сохранить доступ. Код обращения: ${correlationId}`,
      correlationId,
    };
  }
}
