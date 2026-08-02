import { notFound } from "next/navigation";

import {
  AdminCompanyPlatformAccess,
  AdminPageHeader,
  createAdminCompanyService,
  requireAdminPagePermission,
} from "@/src/modules/admin";

export default async function AdminPartnerCompanyAccessPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  await requireAdminPagePermission("admin.companies.view");
  const { companyId } = await params;
  const service = createAdminCompanyService();
  const [company, access] = await Promise.all([
    service.getOverview(companyId),
    service.getAccess(companyId),
  ]);
  if (!company || !access) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Ручное управление функциями платформы. Коммерческий статус и вид цены в 1С не влияют на доступ."
        eyebrow="Компания"
        title={company.displayName}
      />
      <AdminCompanyPlatformAccess access={access} />
    </div>
  );
}
