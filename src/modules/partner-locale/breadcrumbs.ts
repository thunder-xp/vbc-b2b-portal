import type { PartnerLocale } from "./locale";
import { workspaceNavigationHref, type WorkspaceCapabilityKey } from "../partner-cabinet/services/workspace-capability.service";

export type PartnerBreadcrumbItem = Readonly<{
  label: string;
  href: string;
  iconKey?: "dashboard";
}>;

type BreadcrumbCopy = Readonly<{
  academy: string;
  affiliate: string;
  arrivals: string;
  bonus: string;
  cabinet: string;
  cart: string;
  catalog: string;
  collections: string;
  company: string;
  companyUsers: string;
  compare: string;
  competitorPriceImport: string;
  competitorPrices: string;
  createEstimate: string;
  createList: string;
  createReservation: string;
  createServiceRequest: string;
  createSpecification: string;
  createSupportTicket: string;
  customer: string;
  customers: string;
  dashboard: string;
  document: string;
  documents: string;
  estimate: string;
  estimatePreview: string;
  estimates: string;
  estimatesGroup: string;
  expertise: string;
  favorites: string;
  finance: string;
  installation: string;
  installationOrders: string;
  installationProfile: string;
  installationStatus: string;
  itSupport: string;
  knowledge: string;
  knowledgeArticle: string;
  lab: string;
  loyalty: string;
  memberships: string;
  nomenclature: string;
  notifications: string;
  notificationSettings: string;
  offer: string;
  offers: string;
  opportunities: string;
  opportunity: string;
  order: string;
  orders: string;
  ordersFinance: string;
  product: string;
  products: string;
  procurement: string;
  profile: string;
  projectProtection: string;
  proposalGenerator: string;
  purchaseTemplate: string;
  purchaseTemplates: string;
  purchases: string;
  purchasingList: string;
  purchasingLists: string;
  quickOrder: string;
  replenishment: string;
  repeatPurchase: string;
  reservation: string;
  reservations: string;
  sales: string;
  search: string;
  service: string;
  serviceCase: string;
  serviceHistory: string;
  showcase: string;
  specification: string;
  specifications: string;
  support: string;
  supportTicket: string;
  video: string;
}>;

const COPY: Record<PartnerLocale, BreadcrumbCopy> = {
  ru: {
    academy: "Академия",
    affiliate: "Аффилированная программа",
    arrivals: "Поступления",
    bonus: "Бонусная программа",
    cabinet: "Кабинет",
    cart: "Корзина",
    catalog: "Каталог товаров",
    collections: "Подборки",
    company: "Моя компания",
    companyUsers: "Сотрудники",
    compare: "Сравнение",
    competitorPriceImport: "Импорт прайс-листа",
    competitorPrices: "Цены поставщиков",
    createEstimate: "Создать смету",
    createList: "Создать комплект",
    createReservation: "Создать заявку",
    createServiceRequest: "Новая сервисная заявка",
    createSpecification: "Создать спецификацию",
    createSupportTicket: "Новое обращение",
    customer: "Заказчик",
    customers: "Мои заказчики",
    dashboard: "Рабочий стол",
    document: "Документ",
    documents: "Документы",
    estimate: "Смета",
    estimatePreview: "Предпросмотр КП",
    estimates: "Мои сметы",
    estimatesGroup: "Сметы и КП",
    expertise: "Экспертиза Novotech",
    favorites: "Избранное",
    finance: "Финансы",
    installation: "Монтаж и заявки",
    installationOrders: "Монтажные заказы",
    installationProfile: "Профиль инсталлятора",
    installationStatus: "Статус монтажей",
    itSupport: "IT-поддержка",
    knowledge: "База знаний",
    knowledgeArticle: "Материал",
    lab: "Лаборатория Novotech",
    loyalty: "Программы лояльности",
    memberships: "Мои доступы",
    nomenclature: "Моя номенклатура",
    notifications: "Уведомления",
    notificationSettings: "Настройки",
    offer: "Специальное предложение",
    offers: "Специальные предложения",
    opportunities: "Возможности для закупки",
    opportunity: "Возможность для закупки",
    order: "Заказ",
    orders: "Заказы",
    ordersFinance: "Заказы и финансы",
    product: "Товар",
    products: "Товары",
    procurement: "Закупки",
    profile: "Профиль",
    projectProtection: "Проектная защита",
    proposalGenerator: "Генератор КП",
    purchaseTemplate: "Шаблон закупки",
    purchaseTemplates: "Шаблоны закупок",
    purchases: "Покупки",
    purchasingList: "Комплект",
    purchasingLists: "Мои комплекты",
    quickOrder: "Подбор товаров",
    replenishment: "Поступление",
    repeatPurchase: "Повторная покупка",
    reservation: "Заявка на резервирование",
    reservations: "Резервирование",
    sales: "Продажи",
    search: "Поиск",
    service: "Гарантия и техподдержка",
    serviceCase: "Сервисная заявка",
    serviceHistory: "История ремонта",
    showcase: "Витрина",
    specification: "Спецификация",
    specifications: "Спецификации",
    support: "Поддержка",
    supportTicket: "Обращение",
    video: "Видео",
  },
  ro: {
    academy: "Academia",
    affiliate: "Program de afiliere",
    arrivals: "Livrări",
    bonus: "Program de bonusuri",
    cabinet: "Cabinet",
    cart: "Coș",
    catalog: "Catalog produse",
    collections: "Colecții",
    company: "Compania mea",
    companyUsers: "Angajați",
    compare: "Comparație",
    competitorPriceImport: "Import listă de prețuri",
    competitorPrices: "Prețurile furnizorilor",
    createEstimate: "Creează deviz",
    createList: "Creează set",
    createReservation: "Creează solicitare",
    createServiceRequest: "Solicitare service nouă",
    createSpecification: "Creează specificație",
    createSupportTicket: "Solicitare nouă",
    customer: "Client",
    customers: "Clienții mei",
    dashboard: "Spațiu de lucru",
    document: "Document",
    documents: "Documente",
    estimate: "Deviz",
    estimatePreview: "Previzualizare ofertă",
    estimates: "Devizele mele",
    estimatesGroup: "Devize și oferte",
    expertise: "Expertiza Novotech",
    favorites: "Favorite",
    finance: "Finanțe",
    installation: "Montaj și solicitări",
    installationOrders: "Comenzi de instalare",
    installationProfile: "Profil instalator",
    installationStatus: "Starea instalărilor",
    itSupport: "Suport IT",
    knowledge: "Bază de cunoștințe",
    knowledgeArticle: "Material",
    lab: "Laboratorul Novotech",
    loyalty: "Programe de loialitate",
    memberships: "Accesurile mele",
    nomenclature: "Nomenclatorul meu",
    notifications: "Notificări",
    notificationSettings: "Setări",
    offer: "Ofertă specială",
    offers: "Oferte speciale",
    opportunities: "Oportunități de achiziție",
    opportunity: "Oportunitate de achiziție",
    order: "Comandă",
    orders: "Comenzi",
    ordersFinance: "Comenzi și finanțe",
    product: "Produs",
    products: "Produse",
    procurement: "Achiziții",
    profile: "Profil",
    projectProtection: "Protecția proiectelor",
    proposalGenerator: "Generator ofertă",
    purchaseTemplate: "Șablon achiziție",
    purchaseTemplates: "Șabloane achiziții",
    purchases: "Achiziții",
    purchasingList: "Set",
    purchasingLists: "Seturile mele",
    quickOrder: "Selectarea produselor",
    replenishment: "Livrare",
    repeatPurchase: "Cumpărare repetată",
    reservation: "Solicitare de rezervare",
    reservations: "Rezervări",
    sales: "Vânzări",
    search: "Căutare",
    service: "Garanție și suport tehnic",
    serviceCase: "Solicitare service",
    serviceHistory: "Istoric reparație",
    showcase: "Vitrină",
    specification: "Specificație",
    specifications: "Specificații",
    support: "Suport",
    supportTicket: "Solicitare",
    video: "Video",
  },
};

type SearchParamsReader = Pick<URLSearchParams, "get"> & { toString?: () => string };

export const SUPPORTED_PARTNER_ROUTE_AREAS = [
  "arrivals",
  "cart",
  "catalog",
  "company",
  "compare",
  "competitor-prices",
  "customers",
  "documents",
  "estimates",
  "expertise",
  "finance",
  "installation-marketplace",
  "installation-orders",
  "knowledge",
  "loyalty",
  "memberships",
  "nomenclature",
  "notifications",
  "offers",
  "opportunities",
  "orders",
  "profile",
  "purchase-templates",
  "purchasing-lists",
  "quick-order",
  "repeat-purchase",
  "reservation-requests",
  "search",
  "service",
  "specifications",
  "support",
] as const;

export function resolvePartnerBreadcrumbs(
  pathname: string,
  searchParams: SearchParamsReader,
  locale: PartnerLocale,
): PartnerBreadcrumbItem[] {
  const copy = COPY[locale];
  const segments = pathname.split("/").filter(Boolean).slice(1);
  const [area, second, third, , fifth] = segments;
  const serializedQuery = searchParams.toString?.();
  const currentHref = pathname + (serializedQuery && serializedQuery !== "[object Object]" ? `?${serializedQuery}` : "");
  const destination = (key: WorkspaceCapabilityKey) => workspaceNavigationHref(key)!;
  const parentRoutes = new Map<keyof BreadcrumbCopy, string>([
    ["procurement", destination("catalog")], ["products", destination("catalog")],
    ["purchases", "/cabinet/quick-order"], ["collections", destination("purchase_templates")],
    ["sales", destination("proposals")], ["estimatesGroup", destination("proposals")],
    ["estimates", destination("proposals")], ["estimate", second ? `/cabinet/estimates/${second}` : destination("proposals")],
    ["ordersFinance", destination("orders")], ["orders", destination("orders")],
    ["documents", destination("documents")], ["company", destination("company")],
    ["notifications", "/cabinet/notifications"], ["installation", destination("installation_marketplace")],
    ["projectProtection", destination("reservations")], ["reservations", destination("reservations")],
    ["specifications", destination("projects")], ["support", destination("support")],
    ["expertise", destination("expertise_lab")], ["loyalty", destination("loyalty_affiliate")],
    ["service", destination("warranty")], ["knowledge", destination("knowledge_base")],
  ]);
  function items(...keys: (keyof BreadcrumbCopy)[]): PartnerBreadcrumbItem[] {
    const hierarchy = keys.filter((key) => key !== "cabinet" && key !== "dashboard");
    return [
      { label: copy.dashboard, href: destination("dashboard"), iconKey: "dashboard" },
      ...hierarchy.map((key, index) => ({ label: copy[key], href: index === hierarchy.length - 1 ? currentHref : parentRoutes.get(key) ?? currentHref })),
    ];
  }
  if (!area) return items("cabinet", "dashboard");
  if (area === "catalog") {
    if (second === "replenishment") return items("procurement", "products", "replenishment");
    if (second) return items("procurement", "products", "product");
    return items("procurement", "products", searchParams.get("view") === "all" ? "catalog" : "showcase");
  }
  if (area === "quick-order") return items("procurement", "purchases", "quickOrder");
  if (area === "opportunities") return items("procurement", "purchases", second ? "opportunity" : "opportunities");
  if (area === "offers") return items("procurement", "purchases", second ? "offer" : "offers");
  if (area === "arrivals") return items("procurement", "products", second ? "replenishment" : "arrivals");
  if (area === "cart") return items("procurement", "cart");
  if (area === "repeat-purchase") return items("procurement", "purchases", "repeatPurchase");
  if (area === "purchasing-lists") {
    const title = !second && searchParams.get("filter") === "favorites"
      ? "favorites"
      : second === "new"
        ? "createList"
        : second
          ? "purchasingList"
          : "purchasingLists";
    return items("collections", title);
  }
  if (area === "compare") return items("collections", "compare");
  if (area === "purchase-templates") {
    return items("collections", second === "new" ? "createList" : second ? "purchaseTemplate" : "purchaseTemplates");
  }
  if (area === "orders") {
    return second ? items("ordersFinance", "orders", "order") : items("ordersFinance", "orders");
  }
  if (area === "finance") return items("ordersFinance", "finance");
  if (area === "documents") return second ? items("ordersFinance", "documents", "document") : items("ordersFinance", "documents");
  if (area === "company") return second === "users"
    ? items("cabinet", "company", "companyUsers")
    : items("cabinet", "company");
  if (area === "profile") return items("cabinet", "profile");
  if (area === "memberships") return items("cabinet", "memberships");
  if (area === "notifications") return second === "settings"
    ? items("cabinet", "notifications", "notificationSettings")
    : items("cabinet", "notifications");
  if (area === "search") return items("cabinet", "search");
  if (area === "estimates") {
    if (second === "new") return items("sales", "estimatesGroup", "createEstimate");
    if (second === "generator") return items("sales", "estimatesGroup", "proposalGenerator");
    if (third === "preview" || (third === "versions" && fifth === "preview")) return items("sales", "estimatesGroup", "estimatePreview");
    return items("sales", "estimatesGroup", second ? "estimate" : "estimates");
  }
  if (area === "customers") return items("sales", "estimatesGroup", second ? "customer" : "customers");
  if (area === "nomenclature") return items("sales", "estimatesGroup", "nomenclature");
  if (area === "competitor-prices") return items("sales", "estimatesGroup", second ? "competitorPriceImport" : "competitorPrices");
  if (area === "installation-marketplace") {
    const title = searchParams.get("view") === "profile" ? "installationProfile" : "installationStatus";
    return items("sales", "installation", title);
  }
  if (area === "installation-orders") return items("sales", "installation", "installationOrders");
  if (area === "reservation-requests") {
    return items("sales", "projectProtection", second === "new" ? "createReservation" : second ? "reservation" : "reservations");
  }
  if (area === "specifications") {
    return items("sales", "projectProtection", second === "new" ? "createSpecification" : second ? "specification" : "specifications");
  }
  if (area === "expertise") {
    if (second === "academy") return items("support", "expertise", "academy");
    if (second === "lab") return items("support", "expertise", "lab");
    return items("support", "expertise", "video");
  }
  if (area === "loyalty") {
    return items("support", "loyalty", second === "affiliate" ? "affiliate" : "bonus");
  }
  if (area === "service") {
    if (second === "new") return items("support", "service", "createServiceRequest");
    if (second === "history") return items("support", "service", "serviceHistory");
    return second ? items("support", "service", "serviceCase") : items("support", "service");
  }
  if (area === "support") {
    return items("support", "service", second === "new" ? "createSupportTicket" : second ? "supportTicket" : "itSupport");
  }
  if (area === "knowledge") return items("support", "service", second ? "knowledgeArticle" : "knowledge");
  return items("cabinet", "dashboard");
}
