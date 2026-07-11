"use client";

import {
  BookOpen,
  Boxes,
  Building2,
  ClipboardList,
  FileText,
  FolderKanban,
  Gauge,
  LifeBuoy,
  ListChecks,
  SearchCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { WorkspaceCapabilityKey, WorkspaceNavigationItem } from "../services";

const icons = {
  dashboard: Gauge,
  catalog: Boxes,
  solution_selection: SearchCheck,
  projects: FolderKanban,
  proposals: ClipboardList,
  orders: ListChecks,
  documents: FileText,
  warranty: LifeBuoy,
  knowledge_base: BookOpen,
  company: Building2,
} satisfies Record<WorkspaceCapabilityKey, typeof Gauge>;

export function PartnerSidebar({
  hasWorkspaceAccess = true,
  navigation,
  onNavigate,
}: {
  hasWorkspaceAccess?: boolean;
  navigation: WorkspaceNavigationItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full flex-col border-r border-zinc-200 bg-zinc-950 text-white">
      <div className="border-b border-white/10 px-4 py-4">
        <p className="text-xs font-semibold uppercase text-emerald-300">Novotech</p>
        <p className="mt-1 text-base font-semibold">Partner Workspace</p>
      </div>
      <nav aria-label="Рабочие разделы" className="flex-1 space-y-1 px-2 py-3">
        {navigation.map((item) => {
          const Icon = icons[item.icon];
          const enabled = hasWorkspaceAccess && item.availability === "available" && item.href;

          if (!enabled) {
            return (
              <span className="flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-500" key={item.key}>
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <span className="text-[10px] font-semibold uppercase">Скоро</span>
              </span>
            );
          }

          const active = pathname === item.href;
          return (
            <Link
              className={`flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-emerald-600 text-white" : "text-zinc-300 hover:bg-white/10 hover:text-white"}`}
              href={item.href!}
              key={item.key}
              onClick={onNavigate}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
