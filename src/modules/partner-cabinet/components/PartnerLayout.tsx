"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import type { PartnerWorkspaceAccessState } from "../services";
import { PartnerHeader } from "./PartnerHeader";
import { PartnerSidebar } from "./PartnerSidebar";

export type PartnerWorkspaceShellContext = {
  userDisplayName: string;
  userEmail: string;
  companyName: string | null;
  membershipRole: string | null;
  accessState: PartnerWorkspaceAccessState;
};

export function PartnerLayout({
  children,
  context,
}: {
  children: ReactNode;
  context: PartnerWorkspaceShellContext;
}) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const hasWorkspaceAccess = context.accessState === "active" || context.accessState === "missing_price_type";

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-72">
        <PartnerSidebar hasWorkspaceAccess={hasWorkspaceAccess} />
      </div>
      {isDrawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button aria-label="Close navigation" className="absolute inset-0 bg-zinc-950/40" onClick={() => setIsDrawerOpen(false)} type="button" />
          <div className="relative h-full w-72 max-w-[85vw]">
            <PartnerSidebar hasWorkspaceAccess={hasWorkspaceAccess} onNavigate={() => setIsDrawerOpen(false)} />
          </div>
        </div>
      )}
      <div className="lg:pl-72">
        <PartnerHeader context={context} onMenuClick={() => setIsDrawerOpen(true)} />
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
