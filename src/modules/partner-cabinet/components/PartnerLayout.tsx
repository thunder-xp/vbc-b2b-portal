"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import type { ActiveCompanyContextDto } from "@/src/modules/access-control/actions/get-active-company-context.action";
import type { CurrentProfileDto } from "@/src/modules/access-control/actions/current-profile.action";

import { PartnerHeader } from "./PartnerHeader";
import { PartnerSidebar } from "./PartnerSidebar";

type PartnerLayoutProps = {
  children: ReactNode;
  profile: CurrentProfileDto | null;
  companyContext: ActiveCompanyContextDto | null;
};

export function PartnerLayout({
  children,
  profile,
  companyContext,
}: PartnerLayoutProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:block lg:w-72">
        <PartnerSidebar />
      </div>

      {isDrawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-zinc-950/40"
            onClick={() => setIsDrawerOpen(false)}
            type="button"
          />
          <div className="relative h-full w-72 max-w-[85vw]">
            <PartnerSidebar onNavigate={() => setIsDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-72">
        <PartnerHeader
          companyContext={companyContext}
          onMenuClick={() => setIsDrawerOpen(true)}
          profile={profile}
        />
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
