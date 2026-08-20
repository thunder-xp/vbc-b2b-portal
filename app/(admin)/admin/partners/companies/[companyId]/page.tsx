import { notFound } from "next/navigation";

import {
  AdminCompanyPlatformAccess,
  AdminCompanyContractMapping,
  AdminPageHeader,
  createAdminCompanyService,
  requireAdminPagePermission,
} from "@/src/modules/admin";

export default async function AdminPartnerCompanyAccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ accessConflict?: string }>;
}) {
  await requireAdminPagePermission("admin.companies.view");
  const [{ companyId }, query] = await Promise.all([params, searchParams]);
  const service = createAdminCompanyService();
  const [company, access, contractMapping] = await Promise.all([
    service.getOverview(companyId),
    service.getAccess(companyId),
    service.getContractMapping(companyId),
  ]);
  if (!company || !access || !contractMapping) notFound();

  return (
    <div className="space-y-6">
      <AdminPageHeader
        description="Ручное управление функциями платформы. Коммерческий статус и вид цены в 1С не влияют на доступ."
        eyebrow="Компания"
        title={company.displayName}
      />
      <AdminCompanyPlatformAccess
        access={access}
        conflict={query.accessConflict === "1"}
        returnPath={`/admin/partners/companies/${companyId}`}
      />
      <AdminCompanyContractMapping
        mapping={contractMapping}
      />
    </div>
  );
}
