"use client";

import { useRef, useState } from "react";

import type { WorkspaceNavigationItem } from "../services";
import { PartnerSidebar } from "./PartnerSidebar";

const SIDEBAR_COOKIE = "partner_sidebar_collapsed";

export function PartnerDesktopSidebar({
  companyName,
  hasWorkspaceAccess,
  initialCollapsed,
  navigation,
}: {
  companyName: string | null;
  hasWorkspaceAccess: boolean;
  initialCollapsed: boolean;
  navigation: WorkspaceNavigationItem[];
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const shellRef = useRef<HTMLDivElement>(null);

  const updateSidebar = (nextCollapsed: boolean) => {
    setCollapsed(nextCollapsed);
    shellRef.current?.closest("[data-partner-portal]")?.setAttribute("data-sidebar-collapsed", nextCollapsed ? "true" : "false");
    document.cookie = `${SIDEBAR_COOKIE}=${nextCollapsed ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax`;
  };

  return (
    <div
      className={`hidden transition-[width] duration-150 lg:fixed lg:inset-y-0 lg:left-0 lg:block ${collapsed ? "lg:w-20" : "lg:w-72"}`}
      data-partner-sidebar-shell
      data-sidebar-collapsed={collapsed ? "true" : "false"}
      ref={shellRef}
    >
      <PartnerSidebar
        collapsed={collapsed}
        companyName={companyName}
        hasWorkspaceAccess={hasWorkspaceAccess}
        navigation={navigation}
        onCollapsedChange={updateSidebar}
      />
    </div>
  );
}
