import { redirect } from "next/navigation";
import { requireAdminPagePermission } from "@/src/modules/admin";

export default async function DateChangeCompatibilityPage() {
  await requireAdminPagePermission("order_date_changes.review");
  redirect("/admin/date-change-requests");
}
