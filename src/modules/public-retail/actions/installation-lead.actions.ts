"use server";

import { headers } from "next/headers";

import { getSupabaseAdminEnv } from "@/src/lib/env";
import { PublicInstallationLeadInputError } from "@/src/modules/retail-marketplace/services/public-installation-lead.service";
import { getPublicInstallationLeadService } from "@/src/modules/retail-marketplace/server";

export type InstallationLeadActionState = { status: "idle" | "success" | "error"; message: string };

export async function submitPublicInstallationLeadAction(
  _previous: InstallationLeadActionState,
  formData: FormData,
): Promise<InstallationLeadActionState> {
  const locale = formData.get("locale") === "ro" ? "ro" : "ru";
  const ru = locale === "ru";
  if (String(formData.get("website") ?? "").trim()) {
    return { status: "success", message: ru ? "Спасибо. Заявка принята." : "Vă mulțumim. Cererea a fost înregistrată." };
  }
  try {
    const requestHeaders = await headers();
    const requesterAddress = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim()
      || requestHeaders.get("x-real-ip")?.trim()
      || "unavailable";
    const result = await getPublicInstallationLeadService().submit({
      locale,
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      locality: String(formData.get("locality") ?? ""),
      objectType: String(formData.get("objectType") ?? "other") as "apartment" | "house" | "office" | "retail" | "warehouse" | "production" | "other",
      systemType: String(formData.get("systemType") ?? "other") as "cctv" | "access_control" | "alarm" | "intercom" | "network" | "other",
      comment: String(formData.get("comment") ?? "") || null,
      sourcePath: String(formData.get("sourcePath") ?? "/installation"),
      consent: formData.get("consent") === "on",
      submissionKey: String(formData.get("submissionKey") ?? ""),
    }, requesterAddress, getSupabaseAdminEnv().serviceRoleKey);
    if (result.status === "rate_limited") return { status: "error", message: ru ? "Слишком много заявок. Позвоните нам или повторите попытку через 15 минут." : "Au fost trimise prea multe cereri. Sunați-ne sau încercați din nou peste 15 minute." };
    if (result.status === "conflict") return { status: "error", message: ru ? "Форма уже была отправлена с другими данными. Обновите страницу и повторите попытку." : "Formularul a fost deja trimis cu alte date. Reîncărcați pagina și încercați din nou." };
    console.info({ event: "public_installation_lead_submitted", locale, repeated: result.repeated });
    return { status: "success", message: ru ? "Спасибо. Мы свяжемся с вами, чтобы уточнить объект и подготовить решение." : "Vă mulțumim. Vă vom contacta pentru a clarifica obiectivul și a pregăti soluția." };
  } catch (error) {
    const invalid = error instanceof PublicInstallationLeadInputError;
    console.error({ event: "public_installation_lead_failed", errorName: error instanceof Error ? error.name : typeof error, invalid });
    return { status: "error", message: invalid
      ? (ru ? "Проверьте обязательные поля и номер телефона." : "Verificați câmpurile obligatorii și numărul de telefon.")
      : (ru ? "Не удалось отправить заявку. Позвоните нам или повторите попытку позже." : "Cererea nu a putut fi trimisă. Sunați-ne sau încercați mai târziu.") };
  }
}
