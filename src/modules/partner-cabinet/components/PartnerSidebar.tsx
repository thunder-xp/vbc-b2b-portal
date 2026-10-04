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

function SidebarSection({
  children,
  id,
  title,
}: {
  children: ReactNode;
  id: string;
  title: string;
}) {
  const titleId = `${id}-title`;

  return (
    <section
      aria-labelledby={titleId}
      className="border border-white/10 px-1 py-2"
      data-sidebar-section={id}
    >
      <h2
        className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500"
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
  submenu = false,
}: {
  expanded?: boolean;
  hasWorkspaceAccess: boolean;
  item: SidebarNavigationItem;
  onNavigate?: () => void;
  activeKey: string | undefined;
  submenu?: boolean;
}) {
  const t = usePartnerText();
  const [intentPrefetch, setIntentPrefetch] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const Icon = icons[item.icon];
  const enabled = Boolean(hasWorkspaceAccess && item.availability === "available" && item.href);
  const active = enabled && activeKey === item.key;
  const spacing = submenu
    ? "relative min-h-8 py-1.5 pl-3 pr-2 text-[11px] before:absolute before:-left-2 before:top-1/2 before:h-px before:w-2 before:-translate-y-px"
    : "min-h-9 px-2.5 py-1.5 text-xs";
  const connectorColor = submenu
    ? active
      ? "before:bg-emerald-400/60"
      : "before:bg-white/20"
    : "";

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
        className={`flex items-center gap-2.5 rounded-md font-normal text-zinc-500 ${spacing} ${connectorColor}`}
        data-sidebar-submenu-item={submenu ? "true" : undefined}
        data-sidebar-top-level={submenu ? undefined : "true"}
      >
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 whitespace-nowrap">{item.label}</span>
        <span className="shrink-0 text-[10px] font-semibold uppercase">{t("common.comingSoon")}</span>
      </span>
    );
  }

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-md font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${spacing} ${connectorColor} ${
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
  activeKey,
  children,
  routeActiveOverride,
}: {
  children?: ReactNode;
  routeActiveOverride?: boolean;
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
  const Chevron = expanded ? ChevronDown : ChevronRight;

  if (items.length === 0 && !children) return null;

  return (
    <div>
      <button
        aria-controls={id}
        aria-expanded={expanded}
        className={`flex min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
          routeActive ? "text-emerald-200" : "text-zinc-300 hover:bg-white/10 hover:text-white"
        }`}
        onClick={onToggle}
        data-sidebar-top-level="true"
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
          <div className="ml-[18px] space-y-0.5 border-l border-white/15 py-1 pl-2">
            {children}
            {items.map((item) => (
              <NavigationItem
                expanded={expanded}
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
    onToggle: () => setOpenGroupId((current) => current === id ? (activeGroupId === id ? id : null) : id),
  });
  const hasBusinessSection = dashboardNavigation.length > 0 || commercialNavigation.length > 0;
  const hasProductsSection = productNavigation.length > 0 || canSelectProducts || businessNavigation.length > 0 || selectionNavigation.length > 0;
  const hasSalesSection = estimatesNavigation.length > 0 || installationNavigation.length > 0 || projectNavigation.length > 0;
  const hasSupportSection = expertiseNavigation.length > 0 || loyaltyNavigation.length > 0 || supportNavigation.length > 0;

  return (
    <aside
      className="flex h-full min-h-0 flex-col overflow-hidden border-r border-zinc-200 bg-zinc-950 font-[family-name:var(--font-partner-sidebar)] text-white"
      data-sidebar-font="Inter"
      style={{ fontFeatureSettings: '"tnum" on' }}
    >
      <div className="shrink-0 border-b border-white/10 px-4 py-4">
        <p className="text-xs font-semibold uppercase text-emerald-300">Novotech</p>
        <p className="mt-1 text-base font-semibold">{t("shell.partnerCabinet")}</p>
        <p className="mt-1 truncate text-xs text-zinc-400" title={companyName ?? undefined}>{companyName ?? t("shell.companyNotSelected")}</p>
      </div>

      <nav aria-label={t("shell.workspaceNavigation")} className="min-h-0 flex-1 overflow-y-auto px-2 py-2.5">
        <div className="space-y-2">
          {hasBusinessSection && <SidebarSection id="business" title={t("nav.section.business")}>
            {dashboardNavigation.map((item) => (
              <NavigationItem hasWorkspaceAccess={hasWorkspaceAccess} item={item} key={item.key} onNavigate={onNavigate} activeKey={activeKey} />
            ))}

            <ExpandableNavigationGroup {...groupProps("orders-finance-navigation")} hasWorkspaceAccess={hasWorkspaceAccess} icon={ListChecks} id="orders-finance-navigation" items={commercialNavigation} label={t("nav.group.ordersFinance")} onNavigate={onNavigate} activeKey={activeKey} />
          </SidebarSection>}

          {hasProductsSection && <SidebarSection id="products" title={t("nav.section.products")}>
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
          >
            {canSelectProducts && <NavigationItem
              expanded={openGroupId === "purchases-navigation"}
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

          {hasSalesSection && <SidebarSection id="sales" title={t("nav.section.sales")}>
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

          {hasSupportSection && <SidebarSection id="support" title={t("nav.section.support")}>
          <ExpandableNavigationGroup {...groupProps("expertise-navigation")} hasWorkspaceAccess={hasWorkspaceAccess} icon={GraduationCap} id="expertise-navigation" items={expertiseNavigation} label={t("nav.group.expertise")} onNavigate={onNavigate} activeKey={activeKey} />

          <ExpandableNavigationGroup {...groupProps("loyalty-navigation")} hasWorkspaceAccess={hasWorkspaceAccess} icon={Gift} id="loyalty-navigation" items={loyaltyNavigation} label={t("nav.group.loyalty")} onNavigate={onNavigate} activeKey={activeKey} />

          <ExpandableNavigationGroup {...groupProps("support-navigation")} hasWorkspaceAccess={hasWorkspaceAccess} icon={LifeBuoy} id="support-navigation" items={supportNavigation} label={t("nav.group.support")} onNavigate={onNavigate} activeKey={activeKey} />
          </SidebarSection>}
        </div>
      </nav>

    </aside>
  );
}
