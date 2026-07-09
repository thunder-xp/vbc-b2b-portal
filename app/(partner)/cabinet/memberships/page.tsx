import { getOwnMembershipsAction } from "@/src/modules/access-control/actions/get-memberships.action";
import {
  EmptyState,
  MembershipCard,
} from "@/src/modules/partner-cabinet/components";

export default async function CabinetMembershipsPage() {
  const membershipsResult = await getOwnMembershipsAction();

  if (!membershipsResult.success) {
    return (
      <EmptyState
        actionHref="/onboarding"
        actionLabel="Open onboarding"
        message={membershipsResult.message}
        title="Memberships unavailable"
      />
    );
  }

  if (membershipsResult.data.length === 0) {
    return (
      <EmptyState
        actionHref="/onboarding/access-request"
        actionLabel="Request access"
        message="Submit a partner access request to start the Novotech approval workflow."
        title="No memberships yet"
      />
    );
  }

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
          Memberships
        </h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Your portal company memberships. Commercial data is not loaded from
          this view.
        </p>
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        {membershipsResult.data.map((membership) => (
          <MembershipCard key={membership.id} membership={membership} />
        ))}
      </div>
    </div>
  );
}
