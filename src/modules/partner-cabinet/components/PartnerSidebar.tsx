"use client";

import {
  BookOpen,
  Boxes,
  Building2,
  Calculator,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Columns3,
  FileText,
  Landmark,
  FolderKanban,
  Gauge,
  Gift,
  LifeBuoy,
  ListChecks,
  ListPlus,
  ListRestart,
  Lightbulb,
  Megaphone,
  SearchCheck,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { WorkspaceCapabilityKey, WorkspaceNavigationItem } from "../services";
import { NavigationPendingIndicator } from "./NavigationPendingIndicator";

const icons = {
  dashboard: Gauge,
  catalog: Boxes,
  opportunities: Lightbulb,
  offers: Megaphone,
  cart: ShoppingCart,
  purchasing_lists: ListPlus,
  purchase_templates: ListRestart,
  comparison: Columns3,
  solution_selection: SearchCheck,
  projects: FolderKanban,
  reservations: ClipboardList,
  proposals: Calculator,
  customers: Building2,
  orders: ListChecks,
  finance: Landmark,
  documents: FileText,
  warranty: LifeBuoy,
  support: LifeBuoy,
  knowledge_base: BookOpen,
  loyalty_affiliate: Gift,
  loyalty_bonus: Gift,
  company: Building2,
} satisfies Record<WorkspaceCapabilityKey, typeof Gauge>;

const primaryNavigationOrder: readonly WorkspaceCapabilityKey[] = ["dashboard", "catalog"];
const businessNavigationOrder: readonly WorkspaceCapabilityKey[] = ["opportunities", "offers"];
const supportNavigationOrder: readonly WorkspaceCapabilityKey[] = ["warranty", "support", "knowledge_base"];

const selectionNavigationOrder: readonly WorkspaceCapabilityKey[] = [
  "purchasing_lists",
  "purchase_templates",
  "comparison",
];
const projectNavigationOrder: readonly WorkspaceCapabilityKey[] = [
  "reservations",
  "solution_selection",
  "projects",
];
const estimatesNavigationOrder: readonly WorkspaceCapabilityKey[] = ["proposals", "customers"];
const commercialNavigationOrder: readonly WorkspaceCapabilityKey[] = ["orders", "finance", "documents"];
const loyaltyNavigationOrder: readonly WorkspaceCapabilityKey[] = ["loyalty_affiliate", "loyalty_bonus"];

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
  const [intentPrefetch, setIntentPrefetch] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const Icon = icons[item.icon];
  const enabled = Boolean(hasWorkspaceAccess && item.availability === "available" && item.href);
  const active = enabled && isRouteActive(pathname, item.href);
  const spacing = submenu ? "min-h-11 py-2 pl-3 pr-2" : "min-h-11 px-3 py-2";

  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  const startHoverPrefetch = () => {
    if (intentPrefetch || hoverTimer.current) return;
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = null;
      setIntentPrefetch(true);
    }, 100);
  };

  const cancelHoverPrefetch = () => {
    if (!hoverTimer.current) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  };

  if (!enabled) {
    return (
      <span className={`flex items-center gap-3 rounded-md text-sm text-zinc-500 ${spacing}`}>
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 whitespace-nowrap">{item.label}</span>
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
      onFocus={() => setIntentPrefetch(true)}
      onMouseEnter={startHoverPrefetch}
      onMouseLeave={cancelHoverPrefetch}
      prefetch={intentPrefetch}
      tabIndex={expanded ? undefined : -1}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 whitespace-nowrap">{item.label}</span>
      <NavigationPendingIndicator />
    </Link>
  );
}

function ComingSoonNavigationItem({ icon: Icon, label }: { icon: typeof Gauge; label: string }) {
  return (
    <span className="flex min-h-11 items-center gap-3 rounded-md py-2 pl-3 pr-2 text-sm text-zinc-500">
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 whitespace-nowrap">{label}</span>
      <span className="shrink-0 text-[10px] font-semibold uppercase">Скоро</span>
    </span>
  );
}

function ExpandableNavigationGroup({
  icon: Icon,
  hasWorkspaceAccess,
  id,
  items,
  label,
  onNavigate,
  pathname,
  trailingContent,
}: {
  icon: typeof Gauge;
  hasWorkspaceAccess: boolean;
  id: string;
  items: WorkspaceNavigationItem[];
  label: string;
  onNavigate?: () => void;
  pathname: string;
  trailingContent?: ReactNode;
}) {
  const routeActive = items.some((item) => isRouteActive(pathname, item.href));
  const [open, setOpen] = useState(false);
  const expanded = routeActive || open;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  if (items.length === 0) return null;

  return (
    <div>
      <button
        aria-controls={id}
        aria-expanded={expanded}
        className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
          routeActive ? "text-emerald-200" : "text-zinc-300 hover:bg-white/10 hover:text-white"
        }`}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <Icon aria-hidden="true" className={`size-4 shrink-0 ${routeActive ? "text-emerald-300" : ""}`} />
        <span className="min-w-0 flex-1 whitespace-nowrap">{label}</span>
        <Chevron aria-hidden="true" className="size-4 shrink-0" />
      </button>
      <div
        aria-hidden={!expanded}
        className={`grid transition-[grid-template-rows,opacity] duration-150 ease-out ${
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        id={id}
      >
        <div className="overflow-hidden">
          <div className="ml-5 space-y-0.5 border-l border-white/10 py-1 pl-2">
            {items.map((item) => (
              <NavigationItem
                expanded={expanded}
                hasWorkspaceAccess={hasWorkspaceAccess}
                item={item}
                key={item.key}
                onNavigate={onNavigate}
                pathname={pathname}
                submenu
              />
            ))}
            {trailingContent}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PartnerSidebar({
  companyName,
  hasWorkspaceAccess = true,
  navigation,
  onNavigate,
}: {
  companyName?: string | null;
  hasWorkspaceAccess?: boolean;
  navigation: WorkspaceNavigationItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const navigationByKey = new Map(navigation.map((item) => [item.key, item]));
  const primaryNavigation = primaryNavigationOrder.flatMap((key) => {
    const item = navigationByKey.get(key);
    return item ? [item] : [];
  });
  const businessNavigation = businessNavigationOrder.flatMap((key) => {
    const item = navigationByKey.get(key);
    return item ? [item] : [];
  });
  const supportNavigation = supportNavigationOrder.flatMap((key) => {
    const item = navigationByKey.get(key);
    return item ? [item] : [];
  });
  const estimatesNavigation = estimatesNavigationOrder.flatMap((key) => {
    const item = navigationByKey.get(key);
    if (!item) return [];
    return [{ ...item, label: item.key === "proposals" ? "Сметы" : item.label }];
  });
  const selectionNavigation = selectionNavigationOrder.flatMap((key) => {
    const item = navigationByKey.get(key);
    return item ? [item] : [];
  });
  const projectNavigation = projectNavigationOrder.flatMap((key) => {
    const item = navigationByKey.get(key);
    return item ? [item] : [];
  });
  const commercialNavigation = commercialNavigationOrder.flatMap((key) => {
    const item = navigationByKey.get(key);
    return item ? [item] : [];
  });
  const loyaltyNavigation = loyaltyNavigationOrder.flatMap((key) => {
    const item = navigationByKey.get(key);
    return item ? [item] : [];
  });

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-zinc-200 bg-zinc-950 text-white">
      <div className="shrink-0 border-b border-white/10 px-4 py-4">
        <p className="text-xs font-semibold uppercase text-emerald-300">Novotech</p>
        <p className="mt-1 text-base font-semibold">Кабинет партнёра</p>
        <p className="mt-1 truncate text-xs text-zinc-400" title={companyName ?? undefined}>{companyName ?? "Компания не выбрана"}</p>
      </div>

      <nav aria-label="Рабочие разделы" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <div className="space-y-1">
          {primaryNavigation.map((item) => (
            <NavigationItem hasWorkspaceAccess={hasWorkspaceAccess} item={item} key={item.key} onNavigate={onNavigate} pathname={pathname} />
          ))}

          {businessNavigation.map((item) => (
            <NavigationItem hasWorkspaceAccess={hasWorkspaceAccess} item={item} key={item.key} onNavigate={onNavigate} pathname={pathname} />
          ))}

          <ExpandableNavigationGroup hasWorkspaceAccess={hasWorkspaceAccess} icon={SearchCheck} id="product-selection-navigation" items={selectionNavigation} label="Подбор товаров" onNavigate={onNavigate} pathname={pathname} />
          <ExpandableNavigationGroup hasWorkspaceAccess={hasWorkspaceAccess} icon={ShieldCheck} id="project-protection-navigation" items={projectNavigation} label="Проектная защита" onNavigate={onNavigate} pathname={pathname} />

          <ExpandableNavigationGroup
            hasWorkspaceAccess={hasWorkspaceAccess}
            icon={Calculator}
            id="estimates-navigation"
            items={estimatesNavigation}
            label="Сметы и КП"
            onNavigate={onNavigate}
            pathname={pathname}
            trailingContent={estimatesNavigation.length > 0 ? <ComingSoonNavigationItem icon={FileText} label="Генератор КП" /> : null}
          />
          <ExpandableNavigationGroup hasWorkspaceAccess={hasWorkspaceAccess} icon={ListChecks} id="orders-finance-navigation" items={commercialNavigation} label="Заказы и финансы" onNavigate={onNavigate} pathname={pathname} />

          <ExpandableNavigationGroup hasWorkspaceAccess={hasWorkspaceAccess} icon={Gift} id="loyalty-navigation" items={loyaltyNavigation} label="Программы лояльности" onNavigate={onNavigate} pathname={pathname} />

          <ExpandableNavigationGroup hasWorkspaceAccess={hasWorkspaceAccess} icon={LifeBuoy} id="support-navigation" items={supportNavigation} label="Гарантия и техподдержка" onNavigate={onNavigate} pathname={pathname} />
        </div>
      </nav>

    </aside>
  );
}
