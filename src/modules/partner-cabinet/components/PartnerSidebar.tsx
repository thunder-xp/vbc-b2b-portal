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
  Wrench,
  Lightbulb,
  Megaphone,
  SearchCheck,
  Tags,
  ShieldCheck,
  ShoppingCart,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { WorkspaceCapabilityKey, WorkspaceNavigationItem } from "../services";
import { NavigationPendingIndicator } from "./NavigationPendingIndicator";
import { partnerNavigationLabel, usePartnerLocale, usePartnerText } from "../../partner-locale";

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
  nomenclature: ClipboardList,
  proposal_generator: WandSparkles,
  external_prices: Tags,
  orders: ListChecks,
  installation_orders: Wrench,
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
  "external_prices",
];
const projectNavigationOrder: readonly WorkspaceCapabilityKey[] = [
  "reservations",
  "solution_selection",
  "projects",
];
const estimatesNavigationOrder: readonly WorkspaceCapabilityKey[] = ["proposals", "customers", "nomenclature", "proposal_generator"];
const commercialNavigationOrder: readonly WorkspaceCapabilityKey[] = ["orders", "finance", "documents"];
const installationNavigationOrder: readonly WorkspaceCapabilityKey[] = ["installation_orders"];
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
  const t = usePartnerText();
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
        <span className="shrink-0 text-[10px] font-semibold uppercase">{t("common.comingSoon")}</span>
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

function ExpandableNavigationGroup({
  expanded,
  icon: Icon,
  hasWorkspaceAccess,
  id,
  items,
  label,
  onNavigate,
  onToggle,
  pathname,
}: {
  icon: typeof Gauge;
  expanded: boolean;
  hasWorkspaceAccess: boolean;
  id: string;
  items: WorkspaceNavigationItem[];
  label: string;
  onNavigate?: () => void;
  onToggle: () => void;
  pathname: string;
}) {
  const routeActive = items.some((item) => isRouteActive(pathname, item.href));
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
        onClick={onToggle}
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
  const locale = usePartnerLocale();
  const t = usePartnerText();
  const navigationByKey = new Map(navigation.map((item) => [item.key, { ...item, label: partnerNavigationLabel(locale, item.key) }]));
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
    return [item];
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
  const installationNavigation = installationNavigationOrder.flatMap((key) => {
    const item = navigationByKey.get(key);
    return item ? [item] : [];
  });
  const loyaltyNavigation = loyaltyNavigationOrder.flatMap((key) => {
    const item = navigationByKey.get(key);
    return item ? [item] : [];
  });
  const activeGroupId = [
    ["product-selection-navigation", selectionNavigation],
    ["project-protection-navigation", projectNavigation],
    ["estimates-navigation", estimatesNavigation],
    ["orders-finance-navigation", commercialNavigation],
    ["loyalty-navigation", loyaltyNavigation],
    ["support-navigation", supportNavigation],
  ].find(([, items]) => (items as WorkspaceNavigationItem[]).some((item) => isRouteActive(pathname, item.href)))?.[0] as string | undefined;
  const [openGroupId, setOpenGroupId] = useState<string | null>(() => activeGroupId ?? null);
  const [previousActiveGroupId, setPreviousActiveGroupId] = useState(activeGroupId);
  if (activeGroupId !== previousActiveGroupId) {
    setPreviousActiveGroupId(activeGroupId);
    if (activeGroupId) setOpenGroupId(activeGroupId);
  }

  const groupProps = (id: string) => ({
    expanded: openGroupId === id,
    onToggle: () => setOpenGroupId((current) => current === id ? (activeGroupId === id ? id : null) : id),
  });

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-zinc-200 bg-zinc-950 text-white">
      <div className="shrink-0 border-b border-white/10 px-4 py-4">
        <p className="text-xs font-semibold uppercase text-emerald-300">Novotech</p>
        <p className="mt-1 text-base font-semibold">{t("shell.partnerCabinet")}</p>
        <p className="mt-1 truncate text-xs text-zinc-400" title={companyName ?? undefined}>{companyName ?? t("shell.companyNotSelected")}</p>
      </div>

      <nav aria-label={t("shell.workspaceNavigation")} className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <div className="space-y-1">
          {primaryNavigation.map((item) => (
            <NavigationItem hasWorkspaceAccess={hasWorkspaceAccess} item={item} key={item.key} onNavigate={onNavigate} pathname={pathname} />
          ))}

          {businessNavigation.map((item) => (
            <NavigationItem hasWorkspaceAccess={hasWorkspaceAccess} item={item} key={item.key} onNavigate={onNavigate} pathname={pathname} />
          ))}

          <ExpandableNavigationGroup {...groupProps("product-selection-navigation")} hasWorkspaceAccess={hasWorkspaceAccess} icon={SearchCheck} id="product-selection-navigation" items={selectionNavigation} label={t("nav.group.productSelection")} onNavigate={onNavigate} pathname={pathname} />

          <ExpandableNavigationGroup
            hasWorkspaceAccess={hasWorkspaceAccess}
            icon={Calculator}
            id="estimates-navigation"
            items={estimatesNavigation}
            label={t("nav.group.estimates")}
            onNavigate={onNavigate}
            pathname={pathname}
            {...groupProps("estimates-navigation")}
          />
          <ExpandableNavigationGroup {...groupProps("orders-finance-navigation")} hasWorkspaceAccess={hasWorkspaceAccess} icon={ListChecks} id="orders-finance-navigation" items={commercialNavigation} label={t("nav.group.ordersFinance")} onNavigate={onNavigate} pathname={pathname} />

          {installationNavigation.map((item) => (
            <NavigationItem hasWorkspaceAccess={hasWorkspaceAccess} item={item} key={item.key} onNavigate={onNavigate} pathname={pathname} />
          ))}

          <ExpandableNavigationGroup {...groupProps("loyalty-navigation")} hasWorkspaceAccess={hasWorkspaceAccess} icon={Gift} id="loyalty-navigation" items={loyaltyNavigation} label={t("nav.group.loyalty")} onNavigate={onNavigate} pathname={pathname} />

          <ExpandableNavigationGroup {...groupProps("project-protection-navigation")} hasWorkspaceAccess={hasWorkspaceAccess} icon={ShieldCheck} id="project-protection-navigation" items={projectNavigation} label={t("nav.group.projectProtection")} onNavigate={onNavigate} pathname={pathname} />
          <ExpandableNavigationGroup {...groupProps("support-navigation")} hasWorkspaceAccess={hasWorkspaceAccess} icon={LifeBuoy} id="support-navigation" items={supportNavigation} label={t("nav.group.support")} onNavigate={onNavigate} pathname={pathname} />
        </div>
      </nav>

    </aside>
  );
}
