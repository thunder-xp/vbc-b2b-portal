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
        <Info label="Роль" value={context.membershipRole ?? "Не определена"} />
        <Info label="Код компании в 1С" value={context.external1cCode ?? "Не указан"} />
        <Info label="Статус партнёра" value={context.priceTypeName ?? (context.external1cPriceTypeId ? "Назначен" : "Не настроен")} />
      </dl>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-medium text-zinc-500">{label}</dt><dd className="mt-1 text-zinc-950">{value}</dd></div>;
}
