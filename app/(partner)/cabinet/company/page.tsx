import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions";
import { CompanyCard, EmptyState } from "@/src/modules/partner-cabinet/components";
import { companyCopy } from "@/src/modules/partner-locale";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function CabinetCompanyPage() {
  const [result, locale] = await Promise.all([getPartnerWorkspaceContextAction(), getPartnerLocale()]);
  const copy = companyCopy(locale);
  if (!result.success || !result.data.companyName) {
    return <EmptyState message={copy.companyUnavailableMessage} title={copy.companyUnavailable} />;
  }
  return <CompanyCard context={result.data} locale={locale} />;
}
