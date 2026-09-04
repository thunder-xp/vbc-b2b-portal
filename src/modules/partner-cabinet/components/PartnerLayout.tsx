import type { ReactNode } from "react";

import type { PartnerWorkspaceAccessState, WorkspaceNavigationItem } from "../services";
import type { WorkspaceQuickActionDto } from "../services";
import type { NotificationSummary } from "../../notifications";
import { PartnerHeader } from "./PartnerHeader";
import { PartnerMobileNavigation } from "./PartnerMobileNavigation";
import { PartnerSidebar } from "./PartnerSidebar";
import { PartnerLocaleProvider, type PartnerLocale } from "../../partner-locale";

export type PartnerWorkspaceShellContext = {
  locale: PartnerLocale;
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
    <PartnerLocaleProvider locale={context.locale}>
    <div className="app-shell min-h-screen bg-zinc-50 text-zinc-950" lang={context.locale}>
      <div className="app-shell-sidebar hidden lg:fixed lg:inset-y-0 lg:block">
        <PartnerSidebar companyName={context.companyName} hasWorkspaceAccess={hasWorkspaceAccess} navigation={context.navigation} />
      </div>
      <div className="app-shell-frame">
        <PartnerHeader
          context={context}
          mobileNavigation={(
            <PartnerMobileNavigation
              hasWorkspaceAccess={hasWorkspaceAccess}
              companyName={context.companyName}
              navigation={context.navigation}
            />
          )}
        />
        <main className="app-workspace">{children}</main>
      </div>
    </div>
    </PartnerLocaleProvider>
  );
}
