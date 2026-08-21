import Link from "next/link";

import { companyCopy, type PartnerLocale } from "../../partner-locale";
import type { PartnerWorkspaceContext } from "../services";
import { StatusBadge } from "./StatusBadge";
import { CompanyLogoForm } from "./CompanyLogoForm";

export function CompanyCard({ context, locale = "ru" }: { context: PartnerWorkspaceContext; locale?: PartnerLocale }) {
  const copy = companyCopy(locale);
  return <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-medium uppercase text-emerald-700">{copy.partnerCompany}</p><h1 className="mt-2 text-2xl font-semibold text-zinc-950">{context.companyName}</h1></div><StatusBadge label={context.companyStatus === "active" ? copy.activeFeminine : context.companyStatus ?? copy.unknown} tone="green" /></div>
    <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
      <Info label={copy.portalStatus} value={context.companyStatus === "active" ? copy.activeFeminine : context.companyStatus ?? copy.unknown} />
      <Info label={copy.yourRole} value={context.membershipRole ?? copy.unknownFeminine} />
      <Info label={copy.oneCReadiness} value={context.external1cCode ? copy.linkedOneC : copy.notLinkedOneC} />
      {context.capabilities.productCard.showPartnerPrice && <Info label={copy.partnerStatus} value={context.priceTypeName ?? (context.external1cPriceTypeId ? copy.assigned : copy.notConfigured)} />}
    </dl>
    {!context.external1cCode && <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">{copy.oneCWarning}</p>}
    {context.capabilities.productCard.showPartnerPrice && !context.external1cPriceTypeId && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">{copy.commercialWarning}</p>}
    {context.capabilities.canManageCompanyUsers && <Link className="mt-6 inline-flex h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white" href="/cabinet/company/users">{copy.employeesAccess}</Link>}
    {context.canManageCompanyLogo && <CompanyLogoForm hasLogo={Boolean(context.companyLogoUrl)} />}
  </section>;
}

function Info({ label, value }: { label: string; value: string }) { return <div><dt className="font-medium text-zinc-500">{label}</dt><dd className="mt-1 text-zinc-950">{value}</dd></div>; }
