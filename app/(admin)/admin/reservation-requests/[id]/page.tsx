import { redirect } from "next/navigation";
import { requireAdminPagePermission } from "@/src/modules/admin";

export default async function DateChangeDetailCompatibilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPagePermission("order_date_changes.review");
  const { id } = await params;
  redirect(`/admin/date-change-requests/${encodeURIComponent(id)}`);
}
