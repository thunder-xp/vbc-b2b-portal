import { redirect } from "next/navigation";
import { resolveLegacyPurchasingListAction } from "@/src/modules/purchasing-lists/actions/purchasing-list.actions";

export default async function LegacyPurchaseTemplateDetailPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const result = await resolveLegacyPurchasingListAction(templateId);
  if (result.success && result.data) redirect(`/cabinet/purchasing-lists/${result.data}`);
  redirect("/cabinet/purchasing-lists");
}
