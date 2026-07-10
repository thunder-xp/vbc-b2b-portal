import { redirect } from "next/navigation";

import { getWorkspaceHomeAction } from "@/src/modules/partner-cabinet/actions/workspace-home.action";
import { QuickActions } from "@/src/modules/partner-cabinet/components/QuickActions";
import { RecentActivity } from "@/src/modules/partner-cabinet/components/RecentActivity";
import { StatusBadge } from "@/src/modules/partner-cabinet/components/StatusBadge";
import { WorkspaceCard } from "@/src/modules/partner-cabinet/components/WorkspaceCard";
import { WorkspaceEmptyState } from "@/src/modules/partner-cabinet/components/WorkspaceEmptyState";
import { WorkspaceHero } from "@/src/modules/partner-cabinet/components/WorkspaceHero";
import { WorkspaceMetric } from "@/src/modules/partner-cabinet/components/WorkspaceMetric";

export default async function CabinetPage() {
  const workspaceResult = await getWorkspaceHomeAction();

  if (!workspaceResult.success && workspaceResult.errorCode === "AUTH_REQUIRED") {
    redirect("/auth/sign-in");
  }

  if (!workspaceResult.success) {
    return (
      <WorkspaceEmptyState
        actionLabel="Return to onboarding"
        message={workspaceResult.message}
        title="Workspace unavailable"
      />
    );
  }

  const workspace = workspaceResult.data;

  return (
    <div className="space-y-6">
      <WorkspaceHero workspace={workspace} />

      <div className="grid gap-4 lg:grid-cols-4">
        <WorkspaceCard title="My Company">
          <div className="space-y-4">
            <div>
              <p className="text-lg font-semibold text-zinc-950">
                {workspace.company.name}
              </p>
              <p className="mt-1 text-sm text-zinc-600">
                {workspace.company.manager}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatusBadge label={workspace.company.status} tone="green" />
              <StatusBadge label={workspace.company.priceType} tone="zinc" />
            </div>
          </div>
        </WorkspaceCard>

        <WorkspaceCard
          actionHref="/cabinet/catalog"
          actionLabel="Open Catalog"
          title="Catalog"
        >
          <dl className="grid grid-cols-3 gap-4">
            <WorkspaceMetric
              label="Products"
              value={workspace.catalog.totalProductsLabel}
            />
            <WorkspaceMetric label="Brands" value={workspace.catalog.brands} />
            <WorkspaceMetric
              label="Categories"
              value={workspace.catalog.categories}
            />
          </dl>
        </WorkspaceCard>

        <WorkspaceCard title="My Prices">
          <div className="space-y-4">
            <StatusBadge
              label={
                workspace.pricing.isActive
                  ? "Partner pricing active"
                  : "Pricing pending"
              }
              tone={workspace.pricing.isActive ? "green" : "amber"}
            />
            <div>
              <p className="text-sm text-zinc-500">Price type</p>
              <p className="mt-1 font-medium text-zinc-950">
                {workspace.pricing.priceType}
              </p>
            </div>
            <p className="text-sm text-zinc-600">
              Last update: {workspace.pricing.lastUpdate}
            </p>
          </div>
        </WorkspaceCard>

        <WorkspaceCard title="Inventory">
          <div className="space-y-4">
            <StatusBadge
              label={
                workspace.inventory.isSynchronized
                  ? "Stock synchronized"
                  : "Stock sync pending"
              }
              tone={workspace.inventory.isSynchronized ? "green" : "amber"}
            />
            <p className="text-sm text-zinc-600">
              Last synchronization: {workspace.inventory.lastSynchronization}
            </p>
          </div>
        </WorkspaceCard>
      </div>

      <QuickActions />

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <RecentActivity activity={workspace.activity} />
        <section className="grid gap-4">
          <WorkspaceEmptyState
            actionLabel="Create your first order"
            message="Order creation is planned for a future workspace slice."
            title="No recent orders"
          />
          <WorkspaceEmptyState
            actionLabel="Documents will appear here"
            message="Partner documents will be connected after the documents domain slice."
            title="No documents"
          />
        </section>
      </div>
    </div>
  );
}
