import { forbidden, notFound } from "next/navigation";

import {
  AdminPartnerIntegrityDetail,
  createAdminPartnerIntegrityService,
  createAdminPartnerPasswordService,
  requireAdminPagePermission,
} from "@/src/modules/admin";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function AdminPartnerUserDetailPage({ params }: { params: Promise<{ profileId: string }> }) {
  const context = await requireAdminPagePermission("admin.users.view");
  if (!context.permissions.includes("admin.partner_integrity.manage")) forbidden();
  const { profileId } = await params;
  const service = createAdminPartnerIntegrityService();
  const [detail, targetCompanies, locale] = await Promise.all([
    service.getUser(profileId),
    service.listTargetCompanies(),
    getPartnerLocale(),
  ]);
  if (!detail) notFound();
  const passwordChangeAvailable = createAdminPartnerPasswordService().canOfferPasswordChange(detail);
  return (
    <AdminPartnerIntegrityDetail
      detail={detail}
      genericOperationKey={crypto.randomUUID()}
      locale={locale}
      passwordChangeAvailable={passwordChangeAvailable}
      requestOperationKeys={Object.fromEntries(detail.requests.map((request) => [request.id, crypto.randomUUID()]))}
      targetCompanies={targetCompanies}
    />
  );
}
