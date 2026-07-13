export type WorkspaceCapabilityKey =
  | "dashboard"
  | "catalog"
  | "solution_selection"
  | "projects"
  | "reservations"
  | "proposals"
  | "orders"
  | "documents"
  | "warranty"
  | "knowledge_base"
  | "company";

export type WorkspaceCapabilityAvailability = "available" | "coming_soon";

export type WorkspaceNavigationItem = {
  key: WorkspaceCapabilityKey;
  label: string;
  href: string | null;
  icon: WorkspaceCapabilityKey;
  availability: WorkspaceCapabilityAvailability;
};

export type ProductCardCapabilityModel = {
  showPrice: boolean;
  showStock: boolean;
  showExactQuantity: boolean;
  showWarehouseAvailability: boolean;
  showExpectedArrival: boolean;
  showProjectPriceEligibility: boolean;
  showTechnicalDocuments: boolean;
  showCompatibility: boolean;
  canAddToSpecification: boolean;
  canAddToOrder: boolean;
  canAddToProject: boolean;
};

export type WorkspaceCapabilityModel = {
  navigation: WorkspaceNavigationItem[];
  productCard: ProductCardCapabilityModel;
  canCreateCommercialProposal: boolean;
  canUseWarranty: boolean;
  canViewKnowledgeBase: boolean;
};

export type WorkspaceCapabilityConfiguration = {
  modules?: Partial<Record<WorkspaceCapabilityKey, "enabled" | "coming_soon" | "hidden">>;
  priceVisibility?: boolean;
  stockVisibility?: boolean;
  exactStockVisibility?: boolean;
  warehouseVisibility?: boolean;
  expectedArrivalVisibility?: boolean;
  projectPriceAccess?: boolean;
  commercialProposalAccess?: boolean;
  warrantyAccess?: boolean;
  documentAccess?: boolean;
  knowledgeBaseAccess?: boolean;
};

type CapabilityDefinition = {
  key: WorkspaceCapabilityKey;
  label: string;
  href: string | null;
  requiredPermission: string | null;
  released: boolean;
  unavailableBehavior: "hide" | "show_coming_soon";
};

const WORKSPACE_CAPABILITIES: readonly CapabilityDefinition[] = [
  { key: "reservations", label: "Резервирование", href: "/cabinet/reservation-requests", requiredPermission: "reservations.manage", released: true, unavailableBehavior: "hide" },
  { key: "dashboard", label: "Рабочий стол", href: "/cabinet", requiredPermission: null, released: true, unavailableBehavior: "hide" },
  { key: "catalog", label: "Каталог", href: "/cabinet/catalog", requiredPermission: "catalog.view", released: true, unavailableBehavior: "hide" },
  { key: "solution_selection", label: "Подбор решения", href: null, requiredPermission: "catalog.view", released: false, unavailableBehavior: "show_coming_soon" },
  { key: "projects", label: "Спецификации", href: "/cabinet/specifications", requiredPermission: "specifications.manage", released: true, unavailableBehavior: "hide" },
  { key: "proposals", label: "Сметы и КП", href: null, requiredPermission: "orders.create", released: false, unavailableBehavior: "show_coming_soon" },
  { key: "orders", label: "Заказы", href: null, requiredPermission: "orders.create", released: false, unavailableBehavior: "show_coming_soon" },
  { key: "documents", label: "Документы", href: null, requiredPermission: "documents.view_company", released: false, unavailableBehavior: "show_coming_soon" },
  { key: "warranty", label: "Сервис и гарантия", href: null, requiredPermission: "documents.view_company", released: false, unavailableBehavior: "show_coming_soon" },
  { key: "knowledge_base", label: "База знаний", href: null, requiredPermission: "catalog.view", released: false, unavailableBehavior: "show_coming_soon" },
  { key: "company", label: "Моя компания", href: "/cabinet/company", requiredPermission: null, released: true, unavailableBehavior: "hide" },
];

export function resolveWorkspaceCapabilities(
  permissionCodes: ReadonlySet<string>,
  configuration: WorkspaceCapabilityConfiguration = {},
): WorkspaceCapabilityModel {
  const hasPermission = (code: string) => permissionCodes.has(code);
  const navigation = WORKSPACE_CAPABILITIES.flatMap((definition) => {
    const configuredState = configuration.modules?.[definition.key];
    if (configuredState === "hidden") return [];
    const roleAllowed = !definition.requiredPermission || hasPermission(definition.requiredPermission);
    if (!roleAllowed && definition.unavailableBehavior === "hide") return [];
    if (!roleAllowed) return [];

    return [{
      key: definition.key,
      label: definition.label,
      href: definition.released && configuredState !== "coming_soon" ? definition.href : null,
      icon: definition.key,
      availability: definition.released && configuredState !== "coming_soon" ? "available" : "coming_soon",
    } satisfies WorkspaceNavigationItem];
  });

  return {
    navigation,
    productCard: {
      showPrice: configuration.priceVisibility !== false && hasPermission("prices.view"),
      showStock: configuration.stockVisibility !== false && hasPermission("stock.view"),
      showExactQuantity: configuration.exactStockVisibility !== false && hasPermission("stock.view"),
      showWarehouseAvailability: configuration.warehouseVisibility !== false && hasPermission("stock.view"),
      showExpectedArrival: configuration.expectedArrivalVisibility !== false && hasPermission("stock.view"),
      showProjectPriceEligibility: configuration.projectPriceAccess === true,
      showTechnicalDocuments: configuration.documentAccess !== false && hasPermission("documents.view_company"),
      showCompatibility: hasPermission("catalog.view"),
      canAddToSpecification: hasPermission("specifications.manage"),
      canAddToOrder: false,
      canAddToProject: false,
    },
    canCreateCommercialProposal: configuration.commercialProposalAccess !== false && hasPermission("orders.create"),
    canUseWarranty: configuration.warrantyAccess !== false && hasPermission("documents.view_company"),
    canViewKnowledgeBase: configuration.knowledgeBaseAccess !== false && hasPermission("catalog.view"),
  };
}
