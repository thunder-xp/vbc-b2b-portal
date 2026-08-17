import type { Metadata } from "next";

import { publicCompanyContent } from "./public-company-content";
import type { PublicRetailLocale, PublicRetailProductDetailDto } from "./types";

export const PUBLIC_SITE_ORIGIN = "https://www.nsd.md";
export const PUBLIC_SOCIAL_IMAGE = "/retail/security-installation-hero.webp";

type SearchParams = Record<string, string | string[] | undefined>;

type PublicMetadataInput = {
  locale: PublicRetailLocale;
  path: string;
  title: string;
  description: string;
  index?: boolean;
  follow?: boolean;
  canonicalParams?: Record<string, string | number | undefined>;
  images?: string[];
};

export function publicLocalizedUrl(
  path: string,
  locale: PublicRetailLocale,
  params: Record<string, string | number | undefined> = {},
): string {
  const url = new URL(path, PUBLIC_SITE_ORIGIN);
  url.searchParams.set("lang", locale);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function publicAlternates(
  path: string,
  locale: PublicRetailLocale,
  params: Record<string, string | number | undefined> = {},
): Metadata["alternates"] {
  return {
    canonical: publicLocalizedUrl(path, locale, params),
    languages: {
      ru: publicLocalizedUrl(path, "ru", params),
      ro: publicLocalizedUrl(path, "ro", params),
      "x-default": publicLocalizedUrl(path, "ru", params),
    },
  };
}

export function buildPublicMetadata(input: PublicMetadataInput): Metadata {
  const images = (input.images?.length ? input.images : [PUBLIC_SOCIAL_IMAGE])
    .map((image) => new URL(image, PUBLIC_SITE_ORIGIN).toString());
  const canonicalParams = input.canonicalParams ?? {};
  return {
    title: input.title,
    description: input.description,
    alternates: publicAlternates(input.path, input.locale, canonicalParams),
    robots: {
      index: input.index ?? true,
      follow: input.follow ?? true,
    },
    openGraph: {
      type: "website",
      siteName: "Novotech",
      url: publicLocalizedUrl(input.path, input.locale, canonicalParams),
      locale: input.locale === "ro" ? "ro_MD" : "ru_MD",
      alternateLocale: input.locale === "ro" ? ["ru_MD"] : ["ro_MD"],
      title: input.title,
      description: input.description,
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images,
    },
  };
}

export type PublicCatalogSeoState = {
  canonicalParams: Record<string, string | number | undefined>;
  categorySlug: string | undefined;
  index: boolean;
  page: number;
};

export function publicCatalogSeoState(
  params: SearchParams,
  validCategorySlugs: ReadonlySet<string>,
): PublicCatalogSeoState {
  const single = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
  const requestedCategory = single(params.category)?.trim() || undefined;
  const categorySlug = requestedCategory && validCategorySlugs.has(requestedCategory)
    ? requestedCategory
    : undefined;
  const pageValue = single(params.page);
  const parsedPage = pageValue && /^\d+$/.test(pageValue) ? Number(pageValue) : 1;
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const permittedKeys = new Set(["lang", "category", "page"]);
  const hasIndexBlockingParameter = Object.keys(params).some((key) => !permittedKeys.has(key));
  const invalidCategory = Boolean(requestedCategory && !categorySlug);
  const invalidPage = Boolean(pageValue && (!/^\d+$/.test(pageValue) || page < 1));
  const redundantFirstPage = pageValue === "1";

  return {
    categorySlug,
    page,
    index: !hasIndexBlockingParameter && !invalidCategory && !invalidPage && !redundantFirstPage,
    canonicalParams: {
      category: categorySlug,
      page: page > 1 && !invalidPage ? page : undefined,
    },
  };
}

export function hasCalculatorState(params: SearchParams): boolean {
  return Object.keys(params).some((key) => key !== "lang");
}

export function compactSeoDescription(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return fallback;
  return normalized.length <= 158 ? normalized : `${normalized.slice(0, 155).trimEnd()}…`;
}

export function publicProductSeoDescription(
  name: string,
  description: string | null,
  locale: PublicRetailLocale,
): string {
  const normalized = (description ?? "").replace(/\s+/g, " ").trim();
  const fallback = locale === "ro"
    ? `${name}. Preț cu amănuntul, caracteristici, disponibilitate și livrare în Moldova prin Novotech.`
    : `${name}. Розничная цена, характеристики, наличие и доставка по Молдове в каталоге Novotech.`;
  if (normalized.length < 40) return compactSeoDescription("", fallback);
  if (normalized.length >= 120) return compactSeoDescription(normalized, fallback);
  const suffix = locale === "ro"
    ? " Preț, disponibilitate și livrare în Moldova prin Novotech."
    : " Цена, наличие и доставка по Молдове в каталоге Novotech.";
  return compactSeoDescription(`${normalized}${/[.!?]$/.test(normalized) ? "" : "."}${suffix}`, fallback);
}

export function publicCategorySeoDescription(
  name: string | undefined,
  description: string | null | undefined,
  locale: PublicRetailLocale,
): string {
  const normalized = (description ?? "").replace(/\s+/g, " ").trim();
  const subject = name ?? (locale === "ro" ? "Sisteme de securitate" : "Системы безопасности");
  const fallback = locale === "ro"
    ? `${subject}: echipamente profesionale, prețuri cu amănuntul, disponibilitate și livrare în Moldova prin Novotech.`
    : `${subject}: профессиональное оборудование, розничные цены, наличие и доставка по Молдове в каталоге Novotech.`;
  if (normalized.length < 40) return compactSeoDescription("", fallback);
  if (normalized.length >= 120) return compactSeoDescription(normalized, fallback);
  const suffix = locale === "ro"
    ? " Consultați prețurile, disponibilitatea și livrarea prin Novotech."
    : " Сравните цены, наличие и условия доставки в каталоге Novotech.";
  return compactSeoDescription(`${normalized}${/[.!?]$/.test(normalized) ? "" : "."}${suffix}`, fallback);
}

export function publicBreadcrumbSchema(
  items: Array<{ name: string; url: string }>,
): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function publicOrganizationSchemas(
  locale: PublicRetailLocale,
  includeWebsite = false,
): Array<Record<string, unknown>> {
  const organizationId = `${publicLocalizedUrl("/", "ru")}#organization`;
  return [
    {
      "@type": "Organization",
      "@id": organizationId,
      name: "Novotech",
      url: publicLocalizedUrl("/", locale),
      email: publicCompanyContent.email,
      telephone: publicCompanyContent.customerPhone.href.replace("tel:", ""),
      description: publicCompanyContent.descriptor[locale],
      contactPoint: [{ "@type": "ContactPoint", contactType: "customer service", telephone: publicCompanyContent.customerPhone.href.replace("tel:", ""), areaServed: "MD", availableLanguage: ["ru", "ro"] }],
    },
    ...(includeWebsite ? [{
      "@type": "WebSite",
      "@id": `${publicLocalizedUrl("/", "ru")}#website`,
      name: "Novotech",
      url: publicLocalizedUrl("/", locale),
      inLanguage: locale,
      publisher: { "@id": organizationId },
    }] : []),
    ...publicCompanyContent.stores.map((store, index) => ({
      "@type": "Store",
      "@id": `${publicLocalizedUrl("/contacts", "ru")}#store-${index + 1}`,
      name: `Novotech — ${store.city[locale]}`,
      url: publicLocalizedUrl("/contacts", locale),
      telephone: store.phone.href.replace("tel:", ""),
      parentOrganization: { "@id": organizationId },
      address: { "@type": "PostalAddress", streetAddress: store.address[locale], addressLocality: store.city[locale], addressCountry: "MD" },
      openingHours: ["Mo-Fr 09:00-18:00", "Sa 10:00-14:00"],
    })),
  ];
}

export function publicProductSchema(
  product: PublicRetailProductDetailDto,
  locale: PublicRetailLocale,
): Record<string, unknown> {
  const productUrl = publicLocalizedUrl(`/products/${product.slug}`, locale);
  const images = product.gallery.length ? product.gallery : product.image ? [product.image] : [];
  const availability = {
    in_stock: "https://schema.org/InStock",
    low_stock: "https://schema.org/LimitedAvailability",
    available_to_order: "https://schema.org/BackOrder",
    unavailable: "https://schema.org/OutOfStock",
    unknown: undefined,
  }[product.availability];
  return {
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name: product.name,
    sku: product.sku,
    url: productUrl,
    description: product.shortDescription ?? product.description ?? undefined,
    image: images.map((image) => image.url),
    category: product.categoryPath.at(-1)?.name,
    brand: product.brand ? { "@type": "Brand", name: product.brand.name } : undefined,
    offers: {
      "@type": "Offer",
      url: productUrl,
      price: product.price.amount.toFixed(2),
      priceCurrency: product.price.currency,
      availability,
      seller: { "@id": `${publicLocalizedUrl("/", "ru")}#organization` },
    },
  };
}

export function publicInstallationServiceSchema(locale: PublicRetailLocale): Record<string, unknown> {
  const url = publicLocalizedUrl("/installation", locale);
  return {
    "@type": "Service",
    "@id": `${url}#service`,
    name: locale === "ro" ? "Instalarea sistemelor de securitate" : "Монтаж систем безопасности",
    description: locale === "ro"
      ? "Selecție, verificarea compatibilității, instalare și configurare a sistemelor de securitate în Moldova."
      : "Подбор, проверка совместимости, монтаж и настройка систем безопасности в Молдове.",
    areaServed: { "@type": "Country", name: "Moldova" },
    provider: { "@id": `${publicLocalizedUrl("/", "ru")}#organization` },
    url,
  };
}

export function publicArticleSchema(input: {
  locale: PublicRetailLocale;
  path: string;
  title: string;
  description: string;
}): Record<string, unknown> {
  const url = publicLocalizedUrl(input.path, input.locale);
  return {
    "@type": "Article",
    "@id": `${url}#article`,
    headline: input.title,
    description: input.description,
    inLanguage: input.locale,
    mainEntityOfPage: url,
    author: { "@id": `${publicLocalizedUrl("/", "ru")}#organization` },
    publisher: { "@id": `${publicLocalizedUrl("/", "ru")}#organization` },
  };
}
