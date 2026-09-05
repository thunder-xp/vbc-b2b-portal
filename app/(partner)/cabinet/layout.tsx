import type { ReactNode } from "react";
import type { Metadata } from "next";

import { redirect } from "next/navigation";

import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";
import { PartnerLayout } from "@/src/modules/partner-cabinet/components/PartnerLayout";
import { buildQuickActions } from "@/src/modules/partner-cabinet/services";
import { WorkspaceAccessState } from "@/src/modules/partner-cabinet/components/WorkspaceAccessState";
import { getNotificationSummaryAction } from "@/src/modules/notifications/actions/notification.actions";
import { getCartItemCountAction } from "@/src/modules/orders/actions/cart.actions";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function CabinetLayout({ children }: { children: ReactNode }) {
  const [result, locale] = await Promise.all([getPartnerWorkspaceContextAction(), getPartnerLocale()]);

  if (!result.success) {
    if (result.errorCode === "AUTH_REQUIRED") redirect("/auth/sign-in");
    return <WorkspaceAccessState locale={locale} state="unavailable" />;
  }

  const context = result.data;
  if (context.accessState === "internal") redirect("/admin");
  if (context.accessState === "missing_profile") redirect("/onboarding/profile");
  if (context.accessState === "pending_approval" || context.accessState === "rejected") {
    redirect("/onboarding/waiting");
  }

  const [cartItemCountResult, notificationSummaryResult] = await Promise.all([
    context.capabilities.productCard.canAddToOrder ? getCartItemCountAction() : null,
    getNotificationSummaryAction(),
  ]);
  const shell = {
    locale,
    userDisplayName: context.userDisplayName,
    userEmail: context.userEmail,
    companyName: context.companyName,
    membershipRole: context.membershipRole,
    membershipRoleCode: context.membershipRoleCode,
    companyLogoUrl: context.companyLogoUrl,
    partnerStatus: context.capabilities.productCard.showPartnerPrice ? context.priceTypeName : null,
    quickActions: buildQuickActions(context.capabilities.navigation),
    accessState: context.accessState,
    navigation: context.capabilities.navigation,
    cartItemCount: cartItemCountResult?.success ? cartItemCountResult.data : 0,
    notificationSummary: notificationSummaryResult.success
      ? notificationSummaryResult.data
      : { unreadCount: 0, items: [] },
    canAddSelectionToCart: context.capabilities.productCard.canAddToOrder,
    canCreateEstimateFromSelection: context.capabilities.canCreateCommercialProposal,
  };

  if (context.accessState === "suspended") {
    return <PartnerLayout context={shell}><WorkspaceAccessState locale={locale} state="suspended" /></PartnerLayout>;
  }
  if (context.accessState === "missing_membership") {
    return <PartnerLayout context={shell}><WorkspaceAccessState locale={locale} state="missing_membership" /></PartnerLayout>;
  }
  if (context.accessState === "missing_company") {
    return <PartnerLayout context={shell}><WorkspaceAccessState locale={locale} state="missing_company" /></PartnerLayout>;
  }

  return <PartnerLayout context={shell}>{children}</PartnerLayout>;
}
