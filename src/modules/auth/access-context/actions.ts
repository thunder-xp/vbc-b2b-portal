"use server";

import { redirect } from "next/navigation";

import { createBusinessAccessResolver, getCurrentAuthUserId } from "./server";
import type { BusinessContextType } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function switchBusinessContextAction(formData: FormData): Promise<void> {
  const type = String(formData.get("contextType") ?? "") as BusinessContextType;
  const contextId = String(formData.get("contextId") ?? "");
  let target: "/cabinet" | "/agent" | null = null;

  if ((type === "PARTNER" || type === "AGENT") && UUID.test(contextId)) {
    try {
      await getCurrentAuthUserId();
      target = (await createBusinessAccessResolver().select(type, contextId)).targetRoute;
    } catch {
      target = null;
    }
  }

  if (!target) redirect("/auth/select-context?error=unavailable");
  redirect(target);
}
