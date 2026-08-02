import { forbidden, notFound } from "next/navigation";

import {
  AdminPartnerIntegrityDetail,
  createAdminPartnerIntegrityService,
  requireAdminPagePermission,
} from "@/src/modules/admin";

export default async function AdminPartnerUserDetailPage({ params }: { params: Promise<{ profileId: string }> }) {
  const context = await requireAdminPagePermission("admin.users.view");
  if (!context.permissions.includes("admin.partner_integrity.manage")) forbidden();
  const { profileId } = await params;
  const service = createAdminPartnerIntegrityService();
  const [detail, targetCompanies] = await Promise.all([
    service.getUser(profileId),
    service.listTargetCompanies(),
  ]);
  if (!detail) notFound();
  return (
    <AdminPartnerIntegrityDetail
      detail={detail}
      genericOperationKey={crypto.randomUUID()}
      requestOperationKeys={Object.fromEntries(detail.requests.map((request) => [request.id, crypto.randomUUID()]))}
      targetCompanies={targetCompanies}
    />
  );
}
