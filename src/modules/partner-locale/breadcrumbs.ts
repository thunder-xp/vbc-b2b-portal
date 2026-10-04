import type { PartnerLocale } from "./locale";

export type PartnerBreadcrumbItem = Readonly<{
  label: string;
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

type SearchParamsReader = Pick<URLSearchParams, "get">;

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

function items(...labels: string[]): PartnerBreadcrumbItem[] {
  return labels.map((label) => ({ label }));
}

export function resolvePartnerBreadcrumbs(
  pathname: string,
  searchParams: SearchParamsReader,
  locale: PartnerLocale,
): PartnerBreadcrumbItem[] {
  const copy = COPY[locale];
  const segments = pathname.split("/").filter(Boolean).slice(1);
  const [area, second, third, fourth, fifth] = segments;

  if (!area) return items(copy.cabinet, copy.dashboard);
  if (area === "catalog") {
    if (second === "replenishment") return items(copy.procurement, copy.products, copy.replenishment);
    if (second) return items(copy.procurement, copy.products, copy.product);
    return items(copy.procurement, copy.products, searchParams.get("view") === "all" ? copy.catalog : copy.showcase);
  }
  if (area === "quick-order") return items(copy.procurement, copy.purchases, copy.quickOrder);
  if (area === "opportunities") return items(copy.procurement, copy.purchases, second ? copy.opportunity : copy.opportunities);
  if (area === "offers") return items(copy.procurement, copy.purchases, second ? copy.offer : copy.offers);
  if (area === "arrivals") return items(copy.procurement, copy.products, second ? copy.replenishment : copy.arrivals);
  if (area === "cart") return items(copy.procurement, copy.cart);
  if (area === "repeat-purchase") return items(copy.procurement, copy.purchases, copy.repeatPurchase);
  if (area === "purchasing-lists") {
    const title = !second && searchParams.get("filter") === "favorites"
      ? copy.favorites
      : second === "new"
        ? copy.createList
        : second
          ? copy.purchasingList
          : copy.purchasingLists;
    return items(copy.collections, title);
  }
  if (area === "compare") return items(copy.collections, copy.compare);
  if (area === "purchase-templates") {
    return items(copy.collections, second === "new" ? copy.createList : second ? copy.purchaseTemplate : copy.purchaseTemplates);
  }
  if (area === "orders") {
    return items(copy.cabinet, second ? copy.order : copy.orders);
  }
  if (area === "finance") return items(copy.cabinet, copy.finance);
  if (area === "documents") return items(copy.cabinet, second ? copy.document : copy.documents);
  if (area === "company") return second === "users"
    ? items(copy.cabinet, copy.company, copy.companyUsers)
    : items(copy.cabinet, copy.company);
  if (area === "profile") return items(copy.cabinet, copy.profile);
  if (area === "memberships") return items(copy.cabinet, copy.memberships);
  if (area === "notifications") return second === "settings"
    ? items(copy.cabinet, copy.notifications, copy.notificationSettings)
    : items(copy.cabinet, copy.notifications);
  if (area === "search") return items(copy.cabinet, copy.search);
  if (area === "estimates") {
    if (second === "new") return items(copy.sales, copy.estimatesGroup, copy.createEstimate);
    if (second === "generator") return items(copy.sales, copy.estimatesGroup, copy.proposalGenerator);
    if (third === "preview" || (third === "versions" && fifth === "preview")) return items(copy.sales, copy.estimatesGroup, copy.estimatePreview);
    return items(copy.sales, copy.estimatesGroup, second ? copy.estimate : copy.estimates);
  }
  if (area === "customers") return items(copy.sales, copy.estimatesGroup, second ? copy.customer : copy.customers);
  if (area === "nomenclature") return items(copy.sales, copy.estimatesGroup, copy.nomenclature);
  if (area === "competitor-prices") return items(copy.sales, copy.estimatesGroup, second ? copy.competitorPriceImport : copy.competitorPrices);
  if (area === "installation-marketplace") {
    const title = searchParams.get("view") === "profile" ? copy.installationProfile : copy.installationStatus;
    return items(copy.sales, copy.installation, title);
  }
  if (area === "installation-orders") return items(copy.sales, copy.installation, copy.installationOrders);
  if (area === "reservation-requests") {
    return items(copy.sales, copy.projectProtection, second === "new" ? copy.createReservation : second ? copy.reservation : copy.reservations);
  }
  if (area === "specifications") {
    return items(copy.sales, copy.projectProtection, second === "new" ? copy.createSpecification : second ? copy.specification : copy.specifications);
  }
  if (area === "expertise") {
    if (second === "academy") return items(copy.support, copy.expertise, copy.academy);
    if (second === "lab") return items(copy.support, copy.expertise, copy.lab);
    return items(copy.support, copy.expertise, copy.video);
  }
  if (area === "loyalty") {
    return items(copy.support, copy.loyalty, second === "affiliate" ? copy.affiliate : copy.bonus);
  }
  if (area === "service") {
    if (second === "new") return items(copy.support, copy.service, copy.createServiceRequest);
    if (second === "history") return items(copy.support, copy.service, copy.serviceHistory);
    return second ? items(copy.support, copy.service, copy.serviceCase) : items(copy.support, copy.service);
  }
  if (area === "support") {
    return items(copy.support, copy.service, second === "new" ? copy.createSupportTicket : second ? copy.supportTicket : copy.itSupport);
  }
  if (area === "knowledge") return items(copy.support, copy.service, second ? copy.knowledgeArticle : copy.knowledge);
  return items(copy.cabinet, copy.dashboard);
}
