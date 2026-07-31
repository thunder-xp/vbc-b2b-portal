import { redirect } from "next/navigation";

import { requireAdminPagePermission } from "@/src/modules/admin";

export default async function AdminPartnerRequestsPage() {
  await requireAdminPagePermission("onboarding.requests.view");
  redirect("/admin/onboarding");
}
