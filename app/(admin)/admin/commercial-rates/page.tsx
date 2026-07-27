import { redirect } from "next/navigation";
import { requireAdminPagePermission } from "@/src/modules/admin";

export default async function CommercialRatesCompatibilityPage() {
  await requireAdminPagePermission("admin.rates.view");
  redirect("/admin/commercial/rates");
}
