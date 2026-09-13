import { CustomerProfileForm } from "@/src/modules/final-customer/components";
import { finalCustomerCopy, getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { getFinalCustomerContext } from "@/src/modules/final-customer/server";

export default async function FinalCustomerProfilePage() {
  const [context, locale] = await Promise.all([getFinalCustomerContext(), getFinalCustomerLocale()]);
  const copy = finalCustomerCopy[locale];
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{copy.profile}</h1>
      <CustomerProfileForm displayName={context.displayName} email={context.account.email} locale={locale} verifiedPhone={context.verifiedPhone} />
    </main>
  );
}
