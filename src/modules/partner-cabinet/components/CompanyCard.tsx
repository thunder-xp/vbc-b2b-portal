import type { ActiveCompanyContextDto } from "@/src/modules/access-control/actions/get-active-company-context.action";

import { StatusBadge } from "./StatusBadge";

type CompanyCardProps = {
  context: ActiveCompanyContextDto;
};

export function CompanyCard({ context }: CompanyCardProps) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-emerald-700">
            Partner company
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
            {context.company.displayName}
          </h1>
        </div>
        <StatusBadge label={context.company.status} tone="green" />
      </div>

      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-zinc-500">External 1C id</dt>
          <dd className="mt-1 text-zinc-950">{context.company.external1cId}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Membership role</dt>
          <dd className="mt-1 text-zinc-950">{context.membership.roleId}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Membership status</dt>
          <dd className="mt-1 text-zinc-950">{context.membership.status}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Company id</dt>
          <dd className="mt-1 break-all text-zinc-950">{context.company.id}</dd>
        </div>
      </dl>
    </section>
  );
}
