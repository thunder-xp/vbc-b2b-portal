import type { ReactNode } from "react";

import type { PartnerWorkspaceAccessState, WorkspaceNavigationItem } from "../services";
import type { WorkspaceQuickActionDto } from "../services";
import type { NotificationSummary } from "../../notifications";
import { PartnerHeader } from "./PartnerHeader";
import { PartnerMobileNavigation } from "./PartnerMobileNavigation";
import { PartnerSidebar } from "./PartnerSidebar";

export type PartnerWorkspaceShellContext = {
  userDisplayName: string;
  userEmail: string;
  companyName: string | null;
  membershipRole: string | null;
  membershipRoleCode: string | null;
  companyLogoUrl: string | null;
  partnerStatus: string | null;
  quickActions: WorkspaceQuickActionDto[];
  accessState: PartnerWorkspaceAccessState;
  navigation: WorkspaceNavigationItem[];
  cartItemCount: number;
  notificationSummary: NotificationSummary;
};

export function PartnerLayout({
  children,
  context,
}: {
  children: ReactNode;
  context: PartnerWorkspaceShellContext;
}) {
  const hasWorkspaceAccess = context.accessState === "active" || context.accessState === "missing_price_type";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-72">
        <PartnerSidebar hasWorkspaceAccess={hasWorkspaceAccess} navigation={context.navigation} />
      </div>
      <div className="lg:pl-72">
        <PartnerHeader
          context={context}
          mobileNavigation={(
            <PartnerMobileNavigation
              hasWorkspaceAccess={hasWorkspaceAccess}
              navigation={context.navigation}
            />
          )}
        />
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
