"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getAuthenticatedUser } from "../access-control/actions/service-factory";
import { createAgentCabinetService } from "./service";

export type ProfileActionState = { success: boolean; message: string };

export async function updateAgentProfileAction(_state: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  try {
    await getAuthenticatedUser();
    await createAgentCabinetService().updateProfile({
      phone: text(formData, "phone"), email: text(formData, "email"), locality: text(formData, "locality"),
      profession: text(formData, "profession"), workplace: text(formData, "workplace"),
    });
    revalidatePath("/agent/profile");
    return { success: true, message: "Профиль сохранён." };
  } catch { return { success: false, message: "Не удалось сохранить профиль. Проверьте данные." }; }
}

export async function openAgentAttentionAction(formData: FormData) {
  await getAuthenticatedUser();
  const target = await createAgentCabinetService().openAttention(String(formData.get("eventId") ?? ""));
  revalidatePath("/agent");
  redirect(target);
}
function text(data: FormData, key: string) { return String(data.get(key) ?? ""); }
