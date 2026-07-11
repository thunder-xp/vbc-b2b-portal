import type { PartnerWorkspaceContext } from "../services";
import { StatusBadge } from "./StatusBadge";

export function MembershipCard({ context }: { context: PartnerWorkspaceContext }) {
  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-xl font-semibold text-zinc-950">{context.companyName}</h1><p className="mt-1 text-sm text-zinc-600">{context.membershipRole}</p></div>
        <StatusBadge label={context.accessState === "active" ? "Активен" : "Требуется настройка"} tone={context.accessState === "active" ? "green" : "amber"} />
      </div>
      <p className="mt-5 text-sm text-zinc-600">Доступ действует только в рамках выбранной компании и назначенной роли.</p>
    </article>
  );
}
