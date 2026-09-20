import Link from "next/link";
import { redirect } from "next/navigation";

import {
  AccessContextAuthenticationError,
  decideBusinessRoute,
  resolveCurrentBusinessAccess,
  resolveCurrentCustomerAccess,
} from "@/src/modules/auth/access-context";
import { AuthPageShell } from "@/src/modules/auth/components";

export default async function SelectAccessFamilyPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const query = await searchParams;
  const locale = query.lang === "ro" ? "ro" : "ru";
  const ro = locale === "ro";
  let customer: Awaited<ReturnType<typeof resolveCurrentCustomerAccess>>;
  let business: Awaited<ReturnType<typeof resolveCurrentBusinessAccess>>;
  try {
    [customer, business] = await Promise.all([resolveCurrentCustomerAccess(), resolveCurrentBusinessAccess()]);
  } catch (error) {
    if (error instanceof AccessContextAuthenticationError) redirect(`/auth/customer?lang=${locale}`);
    throw error;
  }

  const customerAvailable = customer.status === "AVAILABLE";
  const businessAvailable = business.contexts.some((context) => context.status === "AVAILABLE");
  const businessTarget = decideBusinessRoute(business).targetRoute;
  if (customerAvailable && !businessAvailable) redirect("/account");
  if (!customerAvailable && businessAvailable) redirect(businessTarget);
  if (!customerAvailable && !businessAvailable) redirect("/auth/business-access-state");

  return (
    <AuthPageShell
      description={ro ? "Alegeți spațiul în care doriți să continuați." : "Выберите пространство, в котором хотите продолжить."}
      eyebrow="Novotech Systems Distribution"
      homeHref={`/?lang=${locale}`}
      title={ro ? "Alegeți cabinetul" : "Выберите кабинет"}
    >
      <div className="grid gap-3">
        <Link className={choiceClassName} href="/account">{ro ? "Cont personal" : "Личный кабинет"}</Link>
        <Link className={choiceClassName} href={businessTarget}>{ro ? "Cabinet de lucru" : "Рабочий кабинет"}</Link>
      </div>
    </AuthPageShell>
  );
}

const choiceClassName = "flex min-h-11 items-center justify-center rounded-lg border border-zinc-300 px-4 text-center text-sm font-semibold text-zinc-900 hover:border-emerald-700 hover:bg-emerald-50";
