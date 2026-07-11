import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";
import { CompanyCard, EmptyState } from "@/src/modules/partner-cabinet/components";

export default async function CabinetCompanyPage() {
  const result = await getPartnerWorkspaceContextAction();
  if (!result.success || !result.data.companyName) {
    return <EmptyState message="Компания не найдена или недоступна." title="Компания недоступна" />;
  }
  return <CompanyCard context={result.data} />;
}
