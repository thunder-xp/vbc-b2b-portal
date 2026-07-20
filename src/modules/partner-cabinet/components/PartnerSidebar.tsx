"use client";

import {
  BookOpen,
  Boxes,
  Building2,
  Calculator,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Landmark,
  FolderKanban,
  Gauge,
  LifeBuoy,
  ListChecks,
  ListPlus,
  SearchCheck,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import type { WorkspaceCapabilityKey, WorkspaceNavigationItem } from "../services";

const icons = {
  dashboard: Gauge,
  catalog: Boxes,
  cart: ShoppingCart,
  purchasing_lists: ListPlus,
  solution_selection: SearchCheck,
  projects: FolderKanban,
  reservations: ClipboardList,
  proposals: Calculator,
  orders: ListChecks,
  finance: Landmark,
  documents: FileText,
  warranty: LifeBuoy,
  knowledge_base: BookOpen,
  company: Building2,
} satisfies Record<WorkspaceCapabilityKey, typeof Gauge>;

const primaryNavigationOrder: readonly WorkspaceCapabilityKey[] = [
  "dashboard",
  "catalog",
  "proposals",
  "purchasing_lists",
  "orders",
  "finance",
  "documents",
  "warranty",
  "knowledge_base",
  "company",
];

const projectNavigationOrder: readonly WorkspaceCapabilityKey[] = [
  "reservations",
  "solution_selection",
  "projects",
];

function isRouteActive(pathname: string, href: string | null): boolean {
  if (!href) return false;
  if (href === "/cabinet") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationItem({
  expanded = true,
  hasWorkspaceAccess,
  item,
  onNavigate,
  pathname,
  submenu = false,
}: {
  expanded?: boolean;
  hasWorkspaceAccess: boolean;
  item: WorkspaceNavigationItem;
  onNavigate?: () => void;
  pathname: string;
  submenu?: boolean;
}) {
  const Icon = icons[item.icon];
  const enabled = Boolean(hasWorkspaceAccess && item.availability === "available" && item.href);
  const active = enabled && isRouteActive(pathname, item.href);
  const spacing = submenu ? "min-h-9 py-1.5 pl-3 pr-2" : "min-h-10 px-3 py-2";

  if (!enabled) {
    return (
      <span className={`flex items-center gap-3 rounded-md text-sm text-zinc-500 ${spacing}`}>
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <span className="shrink-0 text-[10px] font-semibold uppercase">Скоро</span>
      </span>
    );
  }

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${spacing} ${
        active
          ? "bg-emerald-500/15 text-emerald-200"
          : "text-zinc-300 hover:bg-white/10 hover:text-white"
      }`}
      href={item.href!}
      onClick={onNavigate}
      prefetch={false}
      tabIndex={expanded ? undefined : -1}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </Link>
  );
}

export function PartnerSidebar({
  hasWorkspaceAccess = true,
  navigation,
  onNavigate,
  cartItemCount = 0,
}: {
  hasWorkspaceAccess?: boolean;
  navigation: WorkspaceNavigationItem[];
  onNavigate?: () => void;
  cartItemCount?: number;
}) {
  const pathname = usePathname();
  const [projectToolsOpen, setProjectToolsOpen] = useState(false);
  const navigationByKey = new Map(navigation.map((item) => [item.key, item]));
  const primaryNavigation = primaryNavigationOrder.flatMap((key) => {
    const item = navigationByKey.get(key);
    return item ? [item] : [];
  });
  const projectNavigation = projectNavigationOrder.flatMap((key) => {
    const item = navigationByKey.get(key);
    return item ? [item] : [];
  });
  const cart = navigationByKey.get("cart");
  const projectRouteActive = projectNavigation.some((item) => isRouteActive(pathname, item.href));
  const projectToolsExpanded = projectRouteActive || projectToolsOpen;
  const ProjectChevron = projectToolsExpanded ? ChevronDown : ChevronRight;

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-zinc-200 bg-zinc-950 text-white">
      <div className="shrink-0 border-b border-white/10 px-4 py-4">
        <p className="text-xs font-semibold uppercase text-emerald-300">Novotech</p>
        <p className="mt-1 text-base font-semibold">Partner Workspace</p>
      </div>

      <nav aria-label="Рабочие разделы" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <div className="space-y-1">
          {primaryNavigation.slice(0, 2).map((item) => (
            <NavigationItem hasWorkspaceAccess={hasWorkspaceAccess} item={item} key={item.key} onNavigate={onNavigate} pathname={pathname} />
          ))}

          {projectNavigation.length > 0 && (
            <div>
              <button
                aria-controls="project-protection-navigation"
                aria-expanded={projectToolsExpanded}
                className={`flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                  projectRouteActive ? "text-emerald-200" : "text-zinc-300 hover:bg-white/10 hover:text-white"
                }`}
                onClick={() => setProjectToolsOpen((open) => !open)}
                type="button"
              >
                <ShieldCheck aria-hidden="true" className={`size-4 shrink-0 ${projectRouteActive ? "text-emerald-300" : ""}`} />
                <span className="min-w-0 flex-1 truncate">Проектная защита</span>
                <ProjectChevron aria-hidden="true" className="size-4 shrink-0" />
              </button>

              <div
                aria-hidden={!projectToolsExpanded}
                className={`grid transition-[grid-template-rows,opacity] duration-150 ease-out ${
                  projectToolsExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                }`}
                id="project-protection-navigation"
              >
                <div className="overflow-hidden">
                  <div className="ml-5 space-y-0.5 border-l border-white/10 py-1 pl-2">
                    {projectNavigation.map((item) => (
                      <NavigationItem
                        expanded={projectToolsExpanded}
                        hasWorkspaceAccess={hasWorkspaceAccess}
                        item={item}
                        key={item.key}
                        onNavigate={onNavigate}
                        pathname={pathname}
                        submenu
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {primaryNavigation.slice(2).map((item) => (
            <NavigationItem hasWorkspaceAccess={hasWorkspaceAccess} item={item} key={item.key} onNavigate={onNavigate} pathname={pathname} />
          ))}
        </div>
      </nav>

      {cart && (
        <div className="shrink-0 border-t border-white/10 p-2" data-testid="sidebar-cart-section">
          {hasWorkspaceAccess && cart.availability === "available" && cart.href ? (
            <Link
              aria-current={isRouteActive(pathname, cart.href) ? "page" : undefined}
              className={`flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
                isRouteActive(pathname, cart.href)
                  ? "bg-emerald-500/15 text-emerald-200"
                  : "text-zinc-300 hover:bg-white/10 hover:text-white"
              }`}
              href={cart.href}
              onClick={onNavigate}
              prefetch={false}
            >
              <ShoppingCart aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{cart.label}</span>
              {cartItemCount > 0 && (
                <span className="min-w-5 shrink-0 rounded-full bg-emerald-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                  {cartItemCount > 99 ? "99+" : cartItemCount}
                </span>
              )}
            </Link>
          ) : (
            <span className="flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm text-zinc-500">
              <ShoppingCart aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{cart.label}</span>
              <span className="shrink-0 text-[10px] font-semibold uppercase">Скоро</span>
            </span>
          )}
        </div>
      )}
    </aside>
  );
}
