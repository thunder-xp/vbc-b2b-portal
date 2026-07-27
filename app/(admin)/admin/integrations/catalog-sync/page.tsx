import { redirect } from "next/navigation";
import { requireAdminPagePermission } from "@/src/modules/admin";

export default async function CatalogSyncCompatibilityPage() {
  await requireAdminPagePermission("admin.catalog.view");
  redirect("/admin/integrations");
}
