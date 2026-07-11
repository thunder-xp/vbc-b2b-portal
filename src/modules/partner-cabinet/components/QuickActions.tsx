import {
  ClipboardPlus,
  FilePlus2,
  FolderPlus,
  PackageSearch,
  RefreshCw,
  ShieldPlus,
} from "lucide-react";
import Link from "next/link";

import type { WorkspaceQuickActionDto } from "../services";

const icons = {
  create_project: FolderPlus,
  select_equipment: PackageSearch,
  create_specification: ClipboardPlus,
  create_proposal: FilePlus2,
  repeat_order: RefreshCw,
  register_warranty: ShieldPlus,
} as const;

export function QuickActions({ actions }: { actions: WorkspaceQuickActionDto[] }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-zinc-950">Быстрые действия</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => {
          const Icon = icons[action.key as keyof typeof icons] ?? ClipboardPlus;
          const content = (
            <>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-semibold">{action.label}</span>
              {action.availability === "coming_soon" && <span className="text-[10px] font-semibold uppercase text-zinc-500">Скоро</span>}
            </>
          );

          return action.href && action.availability === "available" ? (
            <Link className="flex min-h-16 items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-zinc-950 shadow-sm transition hover:border-emerald-500" href={action.href} key={action.key}>
              {content}
            </Link>
          ) : (
            <div className="flex min-h-16 items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-zinc-600" key={action.key}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
