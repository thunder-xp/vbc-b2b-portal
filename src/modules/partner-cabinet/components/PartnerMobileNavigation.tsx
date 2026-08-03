"use client";

import { useState } from "react";

import type { WorkspaceNavigationItem } from "../services/workspace-capability.service";
import { PartnerSidebar } from "./PartnerSidebar";

export function PartnerMobileNavigation({
  hasWorkspaceAccess,
  navigation,
}: {
  hasWorkspaceAccess: boolean;
  navigation: WorkspaceNavigationItem[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        aria-expanded={isOpen}
        aria-label="Открыть навигацию"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 focus-visible:ring-2 focus-visible:ring-emerald-600 lg:hidden"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <span className="h-0.5 w-4 bg-current shadow-[0_6px_0_current,0_-6px_0_current]" />
      </button>
      {isOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Закрыть навигацию"
            className="absolute inset-0 bg-zinc-950/40"
            onClick={() => setIsOpen(false)}
            type="button"
          />
          <div className="relative h-full w-64 max-w-[85vw]">
            <PartnerSidebar
              hasWorkspaceAccess={hasWorkspaceAccess}
              navigation={navigation}
              onNavigate={() => setIsOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
