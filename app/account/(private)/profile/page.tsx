import { CustomerProfileForm } from "@/src/modules/final-customer/components";
import { finalCustomerCopy, getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { getFinalCustomerContext } from "@/src/modules/final-customer/server";
import { WorkspaceHeader, cabinetPage } from "@/src/modules/cabinet-experience/components";

export default async function FinalCustomerProfilePage() {
  const [context, locale] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale()]);
  const copy = finalCustomerCopy[locale];
  return (
    <main className={cabinetPage}>
      <WorkspaceHeader title={copy.profile} />
      <CustomerProfileForm displayName={context.displayName} email={context.account.email} locale={locale} verifiedPhone={context.verifiedPhone} />
    </main>
  );
}
