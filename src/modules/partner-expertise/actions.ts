"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminPermission } from "@/src/modules/admin/services";
import { getPartnerExpertiseService } from "./server";
import { EXPERTISE_SECTIONS, type ExpertiseSection } from "./types";
import { normalizeYouTubeUrl } from "./youtube";

export type ExpertiseEditorState = { error: string | null };

export async function previewYouTubeUrlAction(url: string) {
  await requireAdminPermission("content.manage");
  try {
    return { ok: true as const, data: normalizeYouTubeUrl(url) };
  } catch {
    return { ok: false as const, error: "Укажите корректную ссылку YouTube." };
  }
}

export async function saveExpertiseVideoAction(
  _previous: ExpertiseEditorState,
  formData: FormData,
): Promise<ExpertiseEditorState> {
  await requireAdminPermission("content.manage");
  const section = String(formData.get("section") ?? "") as ExpertiseSection;
  if (!EXPERTISE_SECTIONS.includes(section)) return { error: "Выберите раздел." };
  const number = Number(formData.get("sortOrder"));
  const id = String(formData.get("id") ?? "") || null;
  try {
    const savedId = await getPartnerExpertiseService().save({
      id,
      section,
      youtubeUrl: String(formData.get("youtubeUrl") ?? ""),
      titleRu: String(formData.get("titleRu") ?? ""),
      titleRo: String(formData.get("titleRo") ?? ""),
      descriptionRu: String(formData.get("descriptionRu") ?? ""),
      descriptionRo: String(formData.get("descriptionRo") ?? ""),
      sortOrder: number,
      expectedRevision: id ? Number(formData.get("revision")) : null,
    });
    revalidatePath("/admin/content/partner-videos");
    redirect(`/admin/content/partner-videos/${savedId}?saved=1`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return { error: error instanceof Error && error.message === "INVALID_YOUTUBE_URL" ? "Укажите корректную ссылку YouTube." : "Не удалось сохранить видео." };
  }
}

export async function transitionExpertiseVideoAction(formData: FormData): Promise<void> {
  await requireAdminPermission("content.manage");
  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "") as "publish" | "unpublish" | "archive";
  if (!id || !["publish", "unpublish", "archive"].includes(action)) throw new Error("INVALID_EXPERTISE_TRANSITION");
  await getPartnerExpertiseService().transition(id, action, Number(formData.get("revision")));
  revalidatePath("/admin/content/partner-videos");
  revalidatePath(`/admin/content/partner-videos/${id}`);
  revalidatePath("/cabinet/expertise/lab");
  revalidatePath("/cabinet/expertise/academy");
}
