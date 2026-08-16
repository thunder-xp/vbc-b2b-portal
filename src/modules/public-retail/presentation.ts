import type { PublicRetailAvailability, PublicRetailLocale } from "./types";
import type { PublicRetailCategoryDto } from "./types";

export function publicRetailVisibleCategories(categories: PublicRetailCategoryDto[]): PublicRetailCategoryDto[] {
  const excluded = new Set(categories
    .filter((category) => normalizeCategoryName(category.name) === "PROJECT EQUIPMENT")
    .map((category) => category.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parentId && excluded.has(category.parentId) && !excluded.has(category.id)) {
        excluded.add(category.id);
        changed = true;
      }
    }
  }
  return categories.filter((category) => !excluded.has(category.id));
}

function normalizeCategoryName(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, " ").trim().toUpperCase();
}

export const retailCopy = {
  ru: {
    catalog: "Каталог",
    chooseSystem: "Подобрать систему",
    services: "Монтаж",
    delivery: "Доставка",
    support: "Поддержка",
    contacts: "Контакты",
    partners: "Наши партнёры",
    partnerCabinet: "Кабинет партнёра",
    search: "Поиск по модели, артикулу или названию",
    searchAction: "Найти",
    details: "Подробнее",
    filters: "Фильтры",
    apply: "Применить",
    reset: "Сбросить",
    products: "Товары",
    found: "Найдено товаров",
    noProducts: "По заданным условиям товары не найдены.",
    allCategories: "Все категории",
    showcase: "Витрина",
    popular: "Популярное",
    popularProducts: "Популярные товары",
    popularBadge: "Популярный",
    newProducts: "Новинки",
    newBadge: "Новинка",
    hotPrice: "Горячая цена",
    hotBadge: "Горячая цена",
    showAll: "Показать все",
    emptyShowcase: "В этой подборке пока нет товаров.",
    byPrice: "По цене",
    categoryFilter: "Все категории",
    documents: "Документы",
    datasheet: "Datasheet",
    openDocument: "Открыть",
    price: "Розничная цена",
    sku: "Артикул",
    specifications: "Характеристики",
    description: "Описание",
    backToCatalog: "Вернуться в каталог",
    previous: "Назад",
    next: "Далее",
    menu: "Меню",
    cart: "Корзина",
  },
  ro: {
    catalog: "Catalog",
    chooseSystem: "Alege un sistem",
    services: "Instalare",
    delivery: "Livrare",
    support: "Suport",
    contacts: "Contacte",
    partners: "Partenerii noștri",
    partnerCabinet: "Cabinet partener",
    search: "Căutare după model, cod sau denumire",
    searchAction: "Caută",
    details: "Detalii",
    filters: "Filtre",
    apply: "Aplică",
    reset: "Resetează",
    products: "Produse",
    found: "Produse găsite",
    noProducts: "Nu am găsit produse pentru filtrele selectate.",
    allCategories: "Toate categoriile",
    showcase: "Vitrină",
    popular: "Populare",
    popularProducts: "Produse populare",
    popularBadge: "Popular",
    newProducts: "Noutăți",
    newBadge: "Noutate",
    hotPrice: "Preț special",
    hotBadge: "Preț special",
    showAll: "Vezi toate",
    emptyShowcase: "Momentan nu sunt produse în această selecție.",
    byPrice: "După preț",
    categoryFilter: "Toate categoriile",
    documents: "Documente",
    datasheet: "Fișă tehnică",
    openDocument: "Deschide",
    price: "Preț cu amănuntul",
    sku: "Cod produs",
    specifications: "Caracteristici",
    description: "Descriere",
    backToCatalog: "Înapoi la catalog",
    previous: "Înapoi",
    next: "Înainte",
    menu: "Meniu",
    cart: "Coș",
  },
} as const;

export const availabilityCopy: Record<PublicRetailLocale, Record<PublicRetailAvailability, string>> = {
  ru: {
    in_stock: "В наличии",
    low_stock: "Заканчивается",
    available_to_order: "Под заказ",
    unavailable: "Нет в наличии",
    unknown: "Наличие уточняется",
  },
  ro: {
    in_stock: "În stoc",
    low_stock: "Stoc limitat",
    available_to_order: "La comandă",
    unavailable: "Indisponibil",
    unknown: "Disponibilitatea se confirmă",
  },
};

export const featuredRetailCategories = [
  { slug: "catalog-item-772c9d50", ru: "Видеонаблюдение", ro: "Supraveghere video", icon: "camera" },
  { slug: "catalog-item-f5379005", ru: "Охранные системы", ro: "Sisteme de alarmă", icon: "shield" },
  { slug: "catalog-item-fe802fd7", ru: "Контроль доступа", ro: "Control acces", icon: "key" },
  { slug: "catalog-item-772c9d4b", ru: "Домофония", ro: "Interfonie", icon: "door" },
  { slug: "catalog-item-eedee611", ru: "Сетевое оборудование", ro: "Echipamente de rețea", icon: "network" },
  { slug: "catalog-item-eedee60b", ru: "Электропитание", ro: "Alimentare electrică", icon: "power" },
  { slug: "catalog-item-f5379001", ru: "Монтажные материалы", ro: "Materiale de instalare", icon: "cable" },
] as const;

export const protectedObjectOptions = [
  { key: "apartment", ru: "Квартира", ro: "Apartament", icon: "building" },
  { key: "house", ru: "Частный дом", ro: "Casă", icon: "house" },
  { key: "office", ru: "Офис", ro: "Birou", icon: "briefcase" },
  { key: "retail", ru: "Магазин", ro: "Magazin", icon: "store" },
  { key: "warehouse", ru: "Склад", ro: "Depozit", icon: "warehouse" },
  { key: "production", ru: "Производство", ro: "Producție", icon: "factory" },
  { key: "horeca", ru: "HoReCa", ro: "HoReCa", icon: "utensils" },
  { key: "other", ru: "Другое", ro: "Alt obiect", icon: "shapes" },
] as const;

export function publicRetailLocale(value: string | string[] | undefined): PublicRetailLocale {
  return (Array.isArray(value) ? value[0] : value) === "ro" ? "ro" : "ru";
}

export function publicRetailFullCatalogHref(locale: PublicRetailLocale): string {
  return `/catalog?lang=${locale}&view=all`;
}

export function publicRetailShowcaseHref(locale: PublicRetailLocale): string {
  return `/catalog?lang=${locale}`;
}

export function formatRetailPrice(amount: number, currency: string, locale: PublicRetailLocale): string {
  return new Intl.NumberFormat(locale === "ro" ? "ro-MD" : "ru-MD", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatRetailCardPrice(amount: number, currency: string, locale: PublicRetailLocale): string {
  return `${new Intl.NumberFormat(locale === "ro" ? "ro-MD" : "ru-MD", {
    maximumFractionDigits: 2,
  }).format(amount)} ${currency}`;
}

export function availabilityTone(value: PublicRetailAvailability): string {
  if (value === "in_stock") return "text-emerald-700";
  if (value === "low_stock" || value === "available_to_order") return "text-amber-700";
  if (value === "unavailable") return "text-zinc-500";
  return "text-zinc-600";
}
