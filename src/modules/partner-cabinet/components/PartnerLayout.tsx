import type { ReactNode } from "react";

import type { PartnerWorkspaceAccessState, WorkspaceNavigationItem } from "../services";
import type { WorkspaceQuickActionDto } from "../services";
import type { NotificationSummary } from "../../notifications";
import { PartnerHeader } from "./PartnerHeader";
import { PartnerMobileNavigation } from "./PartnerMobileNavigation";
import { PartnerLocaleProvider, type PartnerLocale } from "../../partner-locale";
import { LiveCommerceSelectionProvider } from "../../catalog/components/LiveCommerceSelectionProvider";
import { PartnerDesktopSidebar } from "./PartnerDesktopSidebar";

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
  canAddSelectionToCart?: boolean;
  canCreateEstimateFromSelection?: boolean;
  canManagePurchasingLists?: boolean;
  sidebarCollapsed?: boolean;
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
    <LiveCommerceSelectionProvider canAddToCart={Boolean(context.canAddSelectionToCart)} canCreateEstimate={Boolean(context.canCreateEstimateFromSelection)} canSaveAsKit={Boolean(context.canManagePurchasingLists)}>
    <div className="group min-h-screen overflow-x-clip bg-zinc-50 text-zinc-950" data-partner-portal data-sidebar-collapsed={context.sidebarCollapsed ? "true" : "false"} lang={context.locale}>
      <PartnerDesktopSidebar
        companyName={context.companyName}
        hasWorkspaceAccess={hasWorkspaceAccess}
        initialCollapsed={Boolean(context.sidebarCollapsed)}
        navigation={context.navigation}
      />
      <div className="transition-[padding] duration-150 lg:pl-72 lg:group-data-[sidebar-collapsed=true]:pl-20" data-partner-main-shell>
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
        <main className="px-4 py-4 lg:px-8" data-partner-content>{children}</main>
      </div>
    </div>
    </LiveCommerceSelectionProvider>
    </PartnerLocaleProvider>
  );
}
