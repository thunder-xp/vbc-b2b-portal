import { redirect } from "next/navigation";

import { requireAdminPagePermission } from "@/src/modules/admin";

type AdminPartnerRequestDetailPageProps = {
  params: Promise<{
    requestId: string;
  }>;
};

export default async function AdminPartnerRequestDetailPage({
  params,
}: AdminPartnerRequestDetailPageProps) {
  await requireAdminPagePermission("onboarding.requests.view");
  const { requestId } = await params;
  redirect(`/admin/onboarding/${requestId}`);
}
