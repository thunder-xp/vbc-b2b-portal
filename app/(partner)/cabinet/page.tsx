import { getCurrentProfileAction } from "@/src/modules/access-control/actions/current-profile.action";
import { getOwnMembershipsAction } from "@/src/modules/access-control/actions/get-memberships.action";
import { MembershipStatus } from "@/src/modules/access-control/types";
import {
  DashboardCard,
  EmptyState,
  StatusBadge,
} from "@/src/modules/partner-cabinet/components";
import { redirect } from "next/navigation";

export default async function CabinetPage() {
  const profileResult = await getCurrentProfileAction();
  const membershipsResult = await getOwnMembershipsAction();
  const activeMemberships = membershipsResult.success
    ? membershipsResult.data.filter(
        (membership) => membership.status === MembershipStatus.Active,
      )
    : [];

  if (!profileResult.success) {
    redirect("/auth/sign-in");
  }

  if (!profileResult.data) {
    return (
      <EmptyState
        actionHref="/onboarding/profile"
        actionLabel="Create profile"
        message="Your partner cabinet is available after your portal profile is created."
        title="Profile required"
      />
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <p className="text-sm font-medium uppercase tracking-[0.14em] text-emerald-700">
          Partner workspace
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          Dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
          Your authenticated Novotech partner workspace. Commercial modules are
          intentionally disabled until their domain slices are implemented.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard
          description="Review and update your safe contact details."
          href="/cabinet/profile"
          meta={<StatusBadge label={profileResult.data.status} tone="zinc" />}
          title="Profile"
        />
        <DashboardCard
          description="View active partner company context when membership is approved."
          href="/cabinet/company"
          meta={
            <StatusBadge
              label={`${activeMemberships.length} active`}
              tone={activeMemberships.length > 0 ? "green" : "amber"}
            />
          }
          title="Company"
        />
        <DashboardCard
          description="Inspect your portal company memberships and current status."
          href="/cabinet/memberships"
          meta={
            <StatusBadge
              label={
                membershipsResult.success
                  ? `${membershipsResult.data.length} total`
                  : "unavailable"
              }
              tone="zinc"
            />
          }
          title="Memberships"
        />
        <DashboardCard
          description="Notification center placeholder for future partner events."
          href="/cabinet/notifications"
          meta={<StatusBadge label="planned" tone="zinc" />}
          title="Notifications"
        />
        <DashboardCard
          description="Browse the read-only product catalog foundation."
          href="/cabinet/catalog"
          meta={<StatusBadge label="ready" tone="green" />}
          title="Catalog"
        />
      </div>
    </div>
  );
}
