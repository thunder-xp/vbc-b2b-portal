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
  GraduationCap,
  Gift,
  LifeBuoy,
  ListChecks,
  Star,
  Layers3,
  Wrench,
  UserRound,
  Lightbulb,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  SearchCheck,
  ShieldCheck,
  ShoppingCart,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { WorkspaceCapabilityKey, WorkspaceNavigationItem } from "../services";
import { activeNavigationKey } from "./active-navigation";
import { NavigationPendingIndicator } from "./NavigationPendingIndicator";
import { partnerNavigationLabel, usePartnerLocale, usePartnerText } from "../../partner-locale";

const icons = {
  dashboard: Gauge,
  catalog: Boxes,
  opportunities: Lightbulb,
  offers: Megaphone,
  cart: ShoppingCart,
  purchasing_lists: Star,
  purchase_templates: Layers3,
  comparison: Columns3,
  solution_selection: SearchCheck,
  projects: FolderKanban,
  reservations: ClipboardList,
  proposals: Calculator,
  customers: Building2,
  nomenclature: ClipboardList,
  proposal_generator: WandSparkles,
  orders: ListChecks,
  installation_marketplace: Wrench,
  installation_profile: UserRound,
  expertise_lab: BookOpen,
  expertise_academy: GraduationCap,
  finance: Landmark,
  documents: FileText,
  warranty: LifeBuoy,
  support: LifeBuoy,
  knowledge_base: BookOpen,
  loyalty_affiliate: Gift,
  loyalty_bonus: Gift,
  company: Building2,
} satisfies Record<WorkspaceCapabilityKey, typeof Gauge>;

const dashboardNavigationOrder: readonly WorkspaceCapabilityKey[] = ["dashboard"];
const catalogNavigationOrder: readonly WorkspaceCapabilityKey[] = ["catalog"];
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
const estimatesNavigationOrder: readonly WorkspaceCapabilityKey[] = ["proposals", "customers", "nomenclature", "proposal_generator"];
const commercialNavigationOrder: readonly WorkspaceCapabilityKey[] = ["orders", "finance", "documents"];
const expertiseNavigationOrder: readonly WorkspaceCapabilityKey[] = ["expertise_lab", "expertise_academy"];
const installationNavigationOrder: readonly WorkspaceCapabilityKey[] = ["installation_marketplace", "installation_profile"];
const loyaltyNavigationOrder: readonly WorkspaceCapabilityKey[] = ["loyalty_affiliate", "loyalty_bonus"];

type SidebarNavigationItem = Omit<WorkspaceNavigationItem, "key"> & { key: string };

const COLLAPSED_TOP_LEVEL_CLASS = "min-h-10 w-full justify-center gap-0 px-2 py-2";

function SidebarIconSlot({ active = false, icon: Icon }: { active?: boolean; icon: typeof Gauge }) {
  return <span className={`inline-flex size-4 shrink-0 items-center justify-center ${active ? "text-emerald-300" : ""}`} data-sidebar-icon-slot>
    <Icon aria-hidden="true" className="size-4 shrink-0" />
  </span>;
}

function SidebarSection({
  children,
  collapsed = false,
  id,
  title,
}: {
  children: ReactNode;
  collapsed?: boolean;
  id: string;
  title: string;
}) {
  const titleId = `${id}-title`;

  return (
    <section
      aria-labelledby={titleId}
      className={`border border-white/10 px-1 py-2 ${collapsed ? "border-x-0" : ""}`}
      data-sidebar-section={id}
    >
      <h2
        className={collapsed ? "sr-only" : "px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500"}
        id={titleId}
      >
        {title}
      </h2>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function NavigationItem({
  expanded = true,
  hasWorkspaceAccess,
  item,
  onNavigate,
  activeKey,
  sidebarCollapsed = false,
  submenu = false,
}: {
  expanded?: boolean;
  hasWorkspaceAccess: boolean;
  item: SidebarNavigationItem;
  onNavigate?: () => void;
  activeKey: string | undefined;
  sidebarCollapsed?: boolean;
  submenu?: boolean;
}) {
  const t = usePartnerText();
  const [intentPrefetch, setIntentPrefetch] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const Icon = icons[item.icon];
  const enabled = Boolean(hasWorkspaceAccess && item.availability === "available" && item.href);
  const active = enabled && activeKey === item.key;
  const spacing = sidebarCollapsed
    ? COLLAPSED_TOP_LEVEL_CLASS
    : submenu
    ? "relative min-h-8 gap-2.5 py-1.5 pl-3 pr-2 text-[11px] before:absolute before:-left-2 before:top-1/2 before:h-px before:w-2 before:-translate-y-px"
    : "min-h-9 gap-2.5 px-2.5 py-1.5 text-xs";
  const connectorColor = submenu
    ? active
      ? "before:bg-emerald-400/60"
      : "before:bg-white/20"
    : "";
  const fontWeight = submenu
    ? active
      ? "font-semibold"
      : "font-medium"
    : "font-semibold";

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
      <span
        aria-label={sidebarCollapsed ? item.label : undefined}
        className={`flex items-center rounded-md font-normal text-zinc-500 ${spacing} ${connectorColor}`}
        data-sidebar-submenu-item={submenu ? "true" : undefined}
        data-sidebar-top-level={submenu ? undefined : "true"}
      >
        <SidebarIconSlot icon={Icon} />
        <span className={sidebarCollapsed ? "sr-only" : "min-w-0 flex-1 whitespace-nowrap"}>{item.label}</span>
        {sidebarCollapsed ? null : <span className="shrink-0 text-[10px] font-semibold uppercase">{t("common.comingSoon")}</span>}
      </span>
    );
  }

  return (
    <Link
      aria-current={active ? "page" : undefined}
      aria-label={sidebarCollapsed ? item.label : undefined}
      className={`flex items-center rounded-md ${fontWeight} outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${spacing} ${connectorColor} ${
        active
          ? "bg-emerald-500/15 text-emerald-200"
          : "text-zinc-300 hover:bg-white/10 hover:text-white"
      }`}
      href={item.href!}
      data-sidebar-submenu-item={submenu ? "true" : undefined}
      data-sidebar-top-level={submenu ? undefined : "true"}
      onClick={onNavigate}
      onFocus={() => setIntentPrefetch(true)}
      onMouseEnter={startHoverPrefetch}
      onMouseLeave={cancelHoverPrefetch}
      prefetch={intentPrefetch}
      tabIndex={expanded ? undefined : -1}
      title={sidebarCollapsed ? item.label : undefined}
    >
      <SidebarIconSlot active={active} icon={Icon} />
      <span className={sidebarCollapsed ? "sr-only" : "min-w-0 flex-1 whitespace-nowrap"}>{item.label}</span>
      {sidebarCollapsed ? null : <NavigationPendingIndicator />}
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
  activeKey,
  activeChildLabel,
  children,
  routeActiveOverride,
  sidebarCollapsed = false,
}: {
  children?: ReactNode;
  routeActiveOverride?: boolean;
  activeChildLabel?: string;
  sidebarCollapsed?: boolean;
  icon: typeof Gauge;
  expanded: boolean;
  hasWorkspaceAccess: boolean;
  id: string;
  items: SidebarNavigationItem[];
  label: string;
  onNavigate?: () => void;
  onToggle: () => void;
  activeKey: string | undefined;
}) {
  const routeActive = routeActiveOverride ?? items.some((item) => activeKey === item.key);
  const visualExpanded = expanded && !sidebarCollapsed;
  const Chevron = visualExpanded ? ChevronDown : ChevronRight;
  const activeChild = activeChildLabel ?? items.find((item) => activeKey === item.key)?.label;
  const accessibleLabel = sidebarCollapsed && activeChild ? `${label}: ${activeChild}` : label;

  if (items.length === 0 && !children) return null;

  return (
    <div>
      <button
        aria-controls={id}
        aria-expanded={visualExpanded}
        aria-label={sidebarCollapsed ? accessibleLabel : undefined}
        className={`flex w-full items-center rounded-md text-left text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${sidebarCollapsed ? COLLAPSED_TOP_LEVEL_CLASS : "min-h-9 gap-2.5 px-2.5 py-1.5"} ${
          routeActive ? "text-emerald-200" : "text-zinc-300 hover:bg-white/10 hover:text-white"
        }`}
        onClick={onToggle}
        data-sidebar-top-level="true"
        type="button"
        title={sidebarCollapsed ? accessibleLabel : undefined}
      >
        <SidebarIconSlot active={routeActive} icon={Icon} />
        <span className={sidebarCollapsed ? "sr-only" : "min-w-0 flex-1 whitespace-nowrap"}>{label}</span>
        {sidebarCollapsed ? null : <Chevron aria-hidden="true" className="size-4 shrink-0" />}
      </button>
      <div
        aria-hidden={!visualExpanded}
        className={`grid transition-[grid-template-rows,opacity] duration-150 ease-out ${
          visualExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        id={id}
      >
        <div className="overflow-hidden">
          <div className="ml-[18px] space-y-0.5 border-l border-white/15 py-1 pl-2">
            {children}
            {items.map((item) => (
              <NavigationItem
                expanded={visualExpanded}
                hasWorkspaceAccess={hasWorkspaceAccess}
                item={item}
                key={item.key}
                onNavigate={onNavigate}
                activeKey={activeKey}
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
  collapsed = false,
  companyName,
  hasWorkspaceAccess = true,
  navigation,
  onCollapsedChange,
  onNavigate,
}: {
  collapsed?: boolean;
  companyName?: string | null;
  hasWorkspaceAccess?: boolean;
  navigation: WorkspaceNavigationItem[];
  onCollapsedChange?: (collapsed: boolean) => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const catalogCapability = navigation.find((item) => item.key === "catalog" && item.availability === "available");
  const canSelectProducts = hasWorkspaceAccess && ["catalog", "cart"].every((key) => navigation.some((item) => item.key === key && item.availability === "available"));
  const activeKey = activeNavigationKey(pathname, searchParams, [
    ...navigation.filter((item) => item.availability === "available"),
    ...(catalogCapability ? [{ key: "catalog_full", href: "/cabinet/catalog?view=all" }] : []),
    ...(canSelectProducts ? [{ key: "product_selection", href: "/cabinet/quick-order" }] : []),
  ]);
  const locale = usePartnerLocale();
  const t = usePartnerText();
  const navigationByKey = new Map(navigation.map((item) => [item.key, { ...item, label: partnerNavigationLabel(locale, item.key) }]));
  const dashboardNavigation = dashboardNavigationOrder.flatMap((key) => {
    const item = navigationByKey.get(key);
    return item ? [item] : [];
  });
  const productNavigation = catalogNavigationOrder.flatMap((key) => {
    const item = navigationByKey.get(key);
    return item ? [
      { ...item, key: "catalog", label: t("nav.sidebar.showcase"), href: "/cabinet/catalog" },
      { ...item, key: "catalog_full", label: partnerNavigationLabel(locale, "catalog"), href: "/cabinet/catalog?view=all" },
    ] : [];
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
  const expertiseNavigation = expertiseNavigationOrder.flatMap((key) => {
    const item = navigationByKey.get(key);
    return item ? [item] : [];
  });
  const loyaltyNavigation = loyaltyNavigationOrder.flatMap((key) => {
    const item = navigationByKey.get(key);
    return item ? [item] : [];
  });
  const activeGroupId = [
    ["products-navigation", productNavigation],
    ["purchases-navigation", [...businessNavigation, { key: "product_selection" }]],
    ["collections-navigation", selectionNavigation],
    ["project-protection-navigation", projectNavigation],
    ["estimates-navigation", estimatesNavigation],
    ["orders-finance-navigation", commercialNavigation],
    ["expertise-navigation", expertiseNavigation],
    ["installation-navigation", installationNavigation],
    ["loyalty-navigation", loyaltyNavigation],
    ["support-navigation", supportNavigation],
  ].find(([, items]) => (items as SidebarNavigationItem[]).some((item) => activeKey === item.key))?.[0] as string | undefined;
  const [openGroupId, setOpenGroupId] = useState<string | null>(() => activeGroupId ?? null);
  const [previousActiveGroupId, setPreviousActiveGroupId] = useState(activeGroupId);
  if (activeGroupId !== previousActiveGroupId) {
    setPreviousActiveGroupId(activeGroupId);
    if (activeGroupId) setOpenGroupId(activeGroupId);
  }

  const groupProps = (id: string) => ({
    expanded: openGroupId === id,
    onToggle: () => {
      if (collapsed) {
        onCollapsedChange?.(false);
        setOpenGroupId(id);
        return;
      }
      setOpenGroupId((current) => current === id ? (activeGroupId === id ? id : null) : id);
    },
    sidebarCollapsed: collapsed,
  });
  const hasBusinessSection = dashboardNavigation.length > 0 || commercialNavigation.length > 0;
  const hasProductsSection = productNavigation.length > 0 || canSelectProducts || businessNavigation.length > 0 || selectionNavigation.length > 0;
  const hasSalesSection = estimatesNavigation.length > 0 || installationNavigation.length > 0 || projectNavigation.length > 0;
  const hasSupportSection = expertiseNavigation.length > 0 || loyaltyNavigation.length > 0 || supportNavigation.length > 0;

  return (
    <aside
      className="flex h-full min-h-0 flex-col overflow-hidden border-r border-zinc-200 bg-zinc-950 text-white"
    >
      <div className={`shrink-0 border-b border-white/10 ${collapsed ? "px-2 py-3 text-center" : "px-4 py-4"}`}>
        <div className={`flex ${collapsed ? "flex-col items-center gap-2" : "items-start justify-between gap-3"}`}>
          <div className="min-w-0">
            <p className={`${collapsed ? "text-[10px] tracking-[0.08em]" : "text-xs"} font-semibold uppercase text-emerald-300`}>NOVOTECH</p>
            {collapsed ? null : <>
              <p className="mt-1 text-base font-semibold">{t("shell.partnerCabinet")}</p>
              <p className="mt-1 truncate text-xs text-zinc-400" title={companyName ?? undefined}>{companyName ?? t("shell.companyNotSelected")}</p>
            </>}
          </div>
          {onCollapsedChange ? <button
            aria-label={t(collapsed ? "shell.expandNavigation" : "shell.collapseNavigation")}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-zinc-300 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-400"
            data-sidebar-collapse-toggle
            onClick={() => onCollapsedChange(!collapsed)}
            title={t(collapsed ? "shell.expandNavigation" : "shell.collapseNavigation")}
            type="button"
          >
            {collapsed ? <PanelLeftOpen aria-hidden="true" className="size-4" /> : <PanelLeftClose aria-hidden="true" className="size-4" />}
          </button> : null}
        </div>
      </div>

      <nav aria-label={t("shell.workspaceNavigation")} className={`min-h-0 flex-1 overflow-y-auto py-2.5 ${collapsed ? "px-1.5" : "px-2"}`}>
        <div className="space-y-2">
          {hasBusinessSection && <SidebarSection collapsed={collapsed} id="business" title={t("nav.section.business")}>
            {dashboardNavigation.map((item) => (
              <NavigationItem hasWorkspaceAccess={hasWorkspaceAccess} item={item} key={item.key} onNavigate={onNavigate} activeKey={activeKey} sidebarCollapsed={collapsed} />
            ))}

            <ExpandableNavigationGroup {...groupProps("orders-finance-navigation")} hasWorkspaceAccess={hasWorkspaceAccess} icon={ListChecks} id="orders-finance-navigation" items={commercialNavigation} label={t("nav.group.ordersFinance")} onNavigate={onNavigate} activeKey={activeKey} />
          </SidebarSection>}

          {hasProductsSection && <SidebarSection collapsed={collapsed} id="products" title={t("nav.section.products")}>
            <ExpandableNavigationGroup
              {...groupProps("products-navigation")}
              hasWorkspaceAccess={hasWorkspaceAccess}
              icon={Boxes}
              id="products-navigation"
              items={productNavigation}
              label={t("nav.group.products")}
              onNavigate={onNavigate}
              activeKey={activeKey}
            />

          {(canSelectProducts || businessNavigation.length > 0) && <ExpandableNavigationGroup
            {...groupProps("purchases-navigation")}
            hasWorkspaceAccess={hasWorkspaceAccess}
            icon={ShoppingCart}
            id="purchases-navigation"
            items={businessNavigation}
            label={t("nav.group.purchases")}
            onNavigate={onNavigate}
            activeKey={activeKey}
            routeActiveOverride={activeGroupId === "purchases-navigation"}
            activeChildLabel={activeKey === "product_selection" ? t("nav.group.productSelection") : undefined}
          >
            {canSelectProducts && <NavigationItem
              expanded={openGroupId === "purchases-navigation" && !collapsed}
              hasWorkspaceAccess={hasWorkspaceAccess}
              item={{ ...navigationByKey.get("catalog")!, key: "product_selection", label: t("nav.group.productSelection"), href: "/cabinet/quick-order", icon: "solution_selection" }}
              onNavigate={onNavigate}
              activeKey={activeKey}
              submenu
            />}
          </ExpandableNavigationGroup>}

          <ExpandableNavigationGroup
            {...groupProps("collections-navigation")}
            hasWorkspaceAccess={hasWorkspaceAccess}
            icon={Layers3}
            id="collections-navigation"
            items={selectionNavigation}
            label={t("nav.group.collections")}
            onNavigate={onNavigate}
            activeKey={activeKey}
          />
          </SidebarSection>}

          {hasSalesSection && <SidebarSection collapsed={collapsed} id="sales" title={t("nav.section.sales")}>
          <ExpandableNavigationGroup
            hasWorkspaceAccess={hasWorkspaceAccess}
            icon={Calculator}
            id="estimates-navigation"
            items={estimatesNavigation}
            label={t("nav.group.estimates")}
            onNavigate={onNavigate}
            activeKey={activeKey}
            {...groupProps("estimates-navigation")}
          />

          <ExpandableNavigationGroup {...groupProps("installation-navigation")} hasWorkspaceAccess={hasWorkspaceAccess} icon={Wrench} id="installation-navigation" items={installationNavigation} label={t("nav.group.installationWorkspace")} onNavigate={onNavigate} activeKey={activeKey} />

          <ExpandableNavigationGroup {...groupProps("project-protection-navigation")} hasWorkspaceAccess={hasWorkspaceAccess} icon={ShieldCheck} id="project-protection-navigation" items={projectNavigation} label={t("nav.group.projectProtection")} onNavigate={onNavigate} activeKey={activeKey} />
          </SidebarSection>}

          {hasSupportSection && <SidebarSection collapsed={collapsed} id="support" title={t("nav.section.support")}>
          <ExpandableNavigationGroup {...groupProps("expertise-navigation")} hasWorkspaceAccess={hasWorkspaceAccess} icon={GraduationCap} id="expertise-navigation" items={expertiseNavigation} label={t("nav.group.expertise")} onNavigate={onNavigate} activeKey={activeKey} />

          <ExpandableNavigationGroup {...groupProps("loyalty-navigation")} hasWorkspaceAccess={hasWorkspaceAccess} icon={Gift} id="loyalty-navigation" items={loyaltyNavigation} label={t("nav.group.loyalty")} onNavigate={onNavigate} activeKey={activeKey} />

          <ExpandableNavigationGroup {...groupProps("support-navigation")} hasWorkspaceAccess={hasWorkspaceAccess} icon={LifeBuoy} id="support-navigation" items={supportNavigation} label={t("nav.group.support")} onNavigate={onNavigate} activeKey={activeKey} />
          </SidebarSection>}
        </div>
      </nav>

    </aside>
  );
}
