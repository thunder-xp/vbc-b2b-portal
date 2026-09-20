import { redirect } from "next/navigation";

import { isUnifiedAuthCenterEnabled } from "@/src/modules/auth/access-context";

export default async function AuthCenterPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  if (!isUnifiedAuthCenterEnabled()) redirect("/auth/sign-in");
  const { lang } = await searchParams;
  redirect(`/auth/customer?lang=${lang === "ro" ? "ro" : "ru"}`);
}
