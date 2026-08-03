"use client";

import {
  ClipboardPlus,
  FilePlus2,
  FolderPlus,
  PackageSearch,
  RefreshCw,
  ListRestart,
  ShoppingCart,
  ShieldPlus,
} from "lucide-react";
import Link from "next/link";

import { recordBehaviorInteraction } from "../../behavior-analytics/components/BehaviorViewEvent";
import type { WorkspaceQuickActionDto } from "../services";

const icons = {
  catalog: PackageSearch,
  estimate: FilePlus2,
  orders: ClipboardPlus,
  shipments: FolderPlus,
  finance: FilePlus2,
  company_users: ShieldPlus,
  repeat_order: RefreshCw,
  purchase_templates: ListRestart,
  cart: ShoppingCart,
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
            </>
          );

          return (
            <Link
              className="flex min-h-16 items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-zinc-950 shadow-sm transition hover:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              href={action.href}
              key={action.key}
              onClick={() => recordBehaviorInteraction({
                eventName: "dashboard_quick_action_clicked",
                metadataSafe: { action: action.key },
                route: "/cabinet",
                sourceSurface: "dashboard_quick_actions",
              })}
              prefetch={false}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
