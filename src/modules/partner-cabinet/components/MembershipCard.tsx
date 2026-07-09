import type { OwnMembershipDto } from "@/src/modules/access-control/actions/get-memberships.action";

import { StatusBadge } from "./StatusBadge";

type MembershipCardProps = {
  membership: OwnMembershipDto;
};

export function MembershipCard({ membership }: MembershipCardProps) {
  const tone = membership.status === "active" ? "green" : "amber";

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            Company {membership.companyId}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Role {membership.roleId}
          </p>
        </div>
        <StatusBadge label={membership.status} tone={tone} />
      </div>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium text-zinc-500">Membership id</dt>
          <dd className="mt-1 break-all text-zinc-950">{membership.id}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Updated</dt>
          <dd className="mt-1 text-zinc-950">{membership.updatedAt}</dd>
        </div>
      </dl>
    </article>
  );
}
