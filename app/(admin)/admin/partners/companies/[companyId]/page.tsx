import { notFound } from "next/navigation";

import {
  AdminCompanyPlatformAccess,
  AdminCompanyContractMapping,
  AdminCompanyCashContractMapping,
  AdminPageHeader,
  createAdminCompanyService,
  requireAdminPagePermission,
} from "@/src/modules/admin";
import { CommercialIntelligenceRepository, CompanyCompetitiveIntelligence } from "@/src/modules/commercial-intelligence";

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
  const [company, access, contractMapping, competitiveIntelligence] = await Promise.all([
    service.getOverview(companyId),
    service.getAccess(companyId),
    service.getContractMapping(companyId),
    new CommercialIntelligenceRepository().getCompany(companyId),
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
      <AdminCompanyCashContractMapping mapping={contractMapping} />
      <CompanyCompetitiveIntelligence data={competitiveIntelligence} />
    </div>
  );
}
