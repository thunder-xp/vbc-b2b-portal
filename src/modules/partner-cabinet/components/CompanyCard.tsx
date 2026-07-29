import Link from "next/link";

import type { PartnerWorkspaceContext } from "../services";
import { StatusBadge } from "./StatusBadge";

export function CompanyCard({ context }: { context: PartnerWorkspaceContext }) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-sm font-medium uppercase text-emerald-700">Компания партнёра</p><h1 className="mt-2 text-2xl font-semibold text-zinc-950">{context.companyName}</h1></div>
        <StatusBadge label={context.companyStatus ?? "Не определён"} tone="green" />
      </div>
      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-3">
        <Info label="Статус портала" value={context.companyStatus === "active" ? "Активна" : context.companyStatus ?? "Не определён"} />
        <Info label="Ваша роль" value={context.membershipRole ?? "Не определена"} />
        <Info label="Готовность 1С" value={context.external1cCode ? "Компания связана с 1С" : "Связь с 1С не настроена"} />
        {context.capabilities.productCard.showPartnerPrice ? (
          <Info label="Статус партнёра" value={context.priceTypeName ?? (context.external1cPriceTypeId ? "Назначен" : "Не настроен")} />
        ) : null}
      </dl>
      {!context.external1cCode ? <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">Компания ещё не связана с 1С. Цены, финансы и заказы могут быть недоступны; обратитесь к Novotech.</p> : null}
      {context.capabilities.productCard.showPartnerPrice && !context.external1cPriceTypeId ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">Коммерческий статус компании не настроен.</p> : null}
      {context.capabilities.canManageCompanyUsers ? (
        <Link className="mt-6 inline-flex h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white" href="/cabinet/company/users">
          Сотрудники и доступ
        </Link>
      ) : null}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-medium text-zinc-500">{label}</dt><dd className="mt-1 text-zinc-950">{value}</dd></div>;
}
