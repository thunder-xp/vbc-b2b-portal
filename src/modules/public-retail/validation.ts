import { z } from "zod";

import { normalizeProductImageUrl } from "../catalog/components/product-image-source";
import type {
  PublicRetailCategoryDto,
  PublicRetailFacetDto,
  PublicRetailProductDetailDto,
  PublicRetailProductPageDto,
  PublicRetailPublicationMetrics,
  PublicRetailCartDto,
  PublicRetailCartMutationDto,
  PublicRetailCheckoutDto,
  PublicRetailOrderCreatedDto,
  PublicRetailOrderDto,
  PublicRetailShowcaseDto,
} from "./types";

const uuid = z.string().uuid();
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const localizedText = z.string().trim().min(1).max(1000);
const availability = z.enum(["in_stock", "low_stock", "available_to_order", "unavailable", "unknown"]);
const price = z.object({
  amount: z.coerce.number().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  vatPresentation: z.enum(["included", "excluded", "not_specified"]),
}).strict();
const media = z.object({ url: z.string().url(), alt: z.string().max(500) }).strict().transform((value, context) => {
  const safeUrl = normalizeProductImageUrl(value.url);
  if (!safeUrl || safeUrl.startsWith("/")) {
    context.addIssue({ code: "custom", message: "Unsafe Public Retail media URL." });
    return z.NEVER;
  }
  return { ...value, url: safeUrl };
});
const specification = z.object({ key: z.string().min(1).max(160), label: localizedText, value: localizedText }).strict();
const datasheet = z.object({ type: z.literal("datasheet"), url: z.string().url().max(2000) }).strict()
  .transform((value, context) => {
    try {
      const url = new URL(value.url);
      const approvedHost = url.hostname === "materialfile.dahuasecurity.com" || url.hostname === "www.dahuasecurity.com";
      if (url.protocol !== "https:" || !approvedHost || url.username || url.password || !url.pathname.toLowerCase().endsWith(".pdf")) {
        context.addIssue({ code: "custom", message: "Unsafe Public Retail datasheet URL." });
        return z.NEVER;
      }
      return { type: "datasheet" as const, url: url.toString() };
    } catch {
      context.addIssue({ code: "custom", message: "Invalid Public Retail datasheet URL." });
      return z.NEVER;
    }
  });
const brand = z.object({ slug, name: localizedText }).strict();
const categorySummary = z.object({ slug, name: localizedText }).strict();
const calculatorProfileKey = z.string().regex(/^cctv\.[a-z0-9]+(?:\.[a-z0-9]+)*$/).max(100);

const summary = z.object({
  id: uuid,
  slug,
  sku: z.string().trim().min(1).max(100),
  name: localizedText,
  shortDescription: z.string().max(2000).nullable(),
  image: media.nullable(),
  brand: brand.nullable(),
  category: categorySummary.nullable(),
  price,
  availability,
  highlights: z.array(specification).max(3),
  calculatorEligible: z.boolean(),
}).strict();

const detailPayload = summary.omit({ category: true, highlights: true }).extend({
  description: z.string().max(50_000).nullable(),
  categoryPath: z.array(z.object({ id: uuid, slug, name: localizedText }).strict()).max(12),
  gallery: z.array(media).max(24),
  specifications: z.array(specification).max(300),
  datasheet: datasheet.nullable(),
}).strict();

const category = z.object({
  id: uuid,
  parentId: uuid.nullable(),
  slug,
  name: localizedText,
  description: z.string().max(5000).nullable(),
  productCount: z.coerce.number().int().nonnegative(),
}).strict();

const facet = z.object({
  key: z.string().min(1).max(160),
  label: localizedText,
  values: z.array(z.object({ value: localizedText, count: z.coerce.number().int().positive() }).strict()).max(30),
  coverage: z.coerce.number().int().nonnegative(),
}).strict();

const publicationMetrics = z.object({
  publicationId: uuid,
  sourceProducts: z.coerce.number().int().nonnegative(),
  eligibleProducts: z.coerce.number().int().nonnegative(),
  excludedProducts: z.coerce.number().int().nonnegative(),
  missingRetail: z.coerce.number().int().nonnegative(),
  missingImage: z.coerce.number().int().nonnegative(),
  missingCategory: z.coerce.number().int().nonnegative(),
  productsWithStructuredSpecifications: z.coerce.number().int().nonnegative(),
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
  failed: z.never().optional(),
}).strict();

export function parsePublicRetailCategories(value: unknown): PublicRetailCategoryDto[] {
  return z.array(category).parse(value);
}

const publicPartnerDirectoryRecord = z.object({
  displayName: localizedText,
  logoAssetPath: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:png|jpg|webp)$/).max(100).nullable(),
}).strict();

export function parsePublicPartnerDirectoryRecords(value: unknown) {
  return z.array(publicPartnerDirectoryRecord).max(100).parse(value);
}

export function parsePublicRetailProductPage(value: unknown): PublicRetailProductPageDto {
  return z.object({
    items: z.array(summary).max(48),
    totalCount: z.coerce.number().int().nonnegative(),
    limit: z.coerce.number().int().min(1).max(48),
    offset: z.coerce.number().int().min(0).max(10_000),
  }).strict().parse(value);
}

export function parsePublicRetailShowcase(value: unknown): PublicRetailShowcaseDto {
  return z.object({
    popular: z.array(summary).max(5),
    new: z.array(summary).max(5),
    hot: z.array(summary).max(5),
  }).strict().parse(value);
}

export function parsePublicRetailProduct(value: unknown): PublicRetailProductDetailDto {
  const product = detailPayload.parse(value);
  const category = product.categoryPath.at(-1);

  return {
    ...product,
    category: category ? { slug: category.slug, name: category.name } : null,
    highlights: product.specifications.slice(0, 3),
  };
}

export function parsePublicRetailFacets(value: unknown): PublicRetailFacetDto[] {
  return z.array(facet).max(200).parse(value);
}

export function parsePublicRetailCalculatorProductResolutions(value: unknown) {
  return z.array(z.object({
    profileKey: calculatorProfileKey,
    matchCount: z.coerce.number().int().min(0).max(10),
    product: summary.nullable(),
  }).strict()).max(30).parse(value);
}

export function parsePublicRetailPublicationMetrics(value: unknown): PublicRetailPublicationMetrics {
  return publicationMetrics.parse(value);
}

const cartItem = z.object({
  publicProductId: uuid, bundleId: uuid.nullable(), source: z.enum(["catalog", "product_detail", "cctv_calculator"]),
  commercialGroup: z.enum(["equipment", "materials"]), slug: slug.nullable(), sku: z.string().min(1).max(100),
  name: localizedText, image: media.nullable(), quantity: z.coerce.number().int().min(1).max(20_000), unitCode: z.enum(["piece", "meter", "service"]).default("piece"),
  price: price.nullable(), availability, lineAmount: z.coerce.number().positive().nullable(), stale: z.boolean(), priceChanged: z.boolean(),
}).strict();
const installationIntent = z.object({ cameraInstallation: z.boolean(), cableLaying: z.boolean(), commissioning: z.boolean(), remoteViewing: z.boolean() }).strict();
const cartBundle = z.object({
  id: uuid, source: z.literal("cctv_calculator"), installationIntent: installationIntent.nullable(),
  calculatorVersion: z.string().min(1).max(100).optional(), calculatorInput: z.record(z.string(), z.unknown()).nullable().optional(),
  workScope: z.array(z.object({ kind: z.string().min(1).max(80), quantity: z.coerce.number().positive(), unitCode: z.enum(["piece", "meter", "service"]) }).strict()).max(20).nullable().optional(),
  installationPricing: z.object({ tariffSetId: uuid, tariffVersion: z.coerce.number().int().positive(), currency: z.string().regex(/^[A-Z]{3}$/), vatTreatment: z.enum(["included", "excluded", "not_specified"]), lines: z.array(z.object({ serviceType: z.string().min(1).max(80), quantity: z.coerce.number().positive(), unitCode: z.enum(["piece", "meter", "service"]), unitPrice: z.coerce.number().nonnegative(), amount: z.coerce.number().nonnegative() }).strict()).max(20), subtotal: z.coerce.number().nonnegative() }).strict().nullable().optional(),
}).strict();
const cartTotals = z.object({ equipment: z.coerce.number().nonnegative().nullable(), materials: z.coerce.number().nonnegative().nullable(), installation: z.coerce.number().nonnegative().nullable(), total: z.coerce.number().nonnegative().nullable(), currency: z.string().regex(/^[A-Z]{3}$/).nullable() }).strict();

export function parsePublicRetailCart(value: unknown): PublicRetailCartDto {
  return z.object({ revision: z.coerce.number().int().nonnegative(), distinctItemCount: z.coerce.number().int().nonnegative(), totalQuantity: z.coerce.number().int().nonnegative(), items: z.array(cartItem).max(100), bundles: z.array(cartBundle).max(20), totals: cartTotals }).strict().parse(value);
}
export function parsePublicRetailCartMutation(value: unknown): PublicRetailCartMutationDto {
  return z.object({ revision: z.coerce.number().int().positive(), distinctItemCount: z.coerce.number().int().nonnegative(), totalQuantity: z.coerce.number().int().nonnegative(), repeated: z.boolean(), bundleId: uuid.nullable() }).strict().parse(value);
}

export function parsePublicRetailCartSummary(value: unknown): { distinctItemCount: number; totalQuantity: number } {
  return z.object({
    distinctItemCount: z.coerce.number().int().nonnegative(),
    totalQuantity: z.coerce.number().int().nonnegative(),
  }).strict().parse(value);
}

const checkoutLine = z.object({
  publicProductId: uuid, bundleId: uuid.nullable(), source: z.enum(["catalog", "product_detail", "cctv_calculator"]),
  commercialGroup: z.enum(["equipment", "materials"]), slug, sku: z.string().min(1).max(100), name: localizedText,
  imageUrl: z.string().url().nullable(), quantity: z.coerce.number().int().min(1).max(20_000), unitCode: z.enum(["piece", "meter", "service"]),
  unitPrice: z.coerce.number().positive(), lineTotal: z.coerce.number().positive(), currency: z.string().regex(/^[A-Z]{3}$/),
  vatPresentation: z.enum(["included", "excluded", "not_specified"]), availability,
  priceChanged: z.boolean(), missing: z.boolean(),
}).strict();
const checkoutTotals = z.object({ equipment: z.coerce.number().nonnegative(), materials: z.coerce.number().nonnegative(), total: z.coerce.number().positive(), currency: z.string().regex(/^[A-Z]{3}$/), vatPresentation: z.enum(["included", "excluded", "not_specified", "mixed"]) }).strict();

export function parsePublicRetailCheckout(value: unknown): PublicRetailCheckoutDto {
  return z.object({ cartRevision: z.coerce.number().int().nonnegative(), publicationId: uuid, eligible: z.boolean(),
    blockingReason: z.enum(["empty_cart", "unpublished_product", "unavailable_product", "currency_conflict"]).nullable(),
    priceChanged: z.boolean(), fingerprint: z.string().regex(/^[0-9a-f]{64}$/), lines: z.array(checkoutLine).max(100),
    bundles: z.array(cartBundle).max(20), totals: checkoutTotals }).strict().parse(value);
}

const address = z.object({ locality: localizedText, street: localizedText, building: localizedText, unit: z.string().max(80).nullable(), postalCode: z.string().max(20).nullable(), instructions: z.string().max(500).nullable() }).strict();
export function parsePublicRetailOrder(value: unknown): PublicRetailOrderDto {
  return z.object({ orderNumber: z.string().regex(/^R-[0-9]{4}-[0-9]{6}$/), status: z.literal("awaiting_payment"), createdAt: z.string().datetime({ offset: true }), locale: z.enum(["ru", "ro"]),
    customer: z.object({ name: localizedText, phone: z.string().regex(/^\+373[0-9]{8}$/), email: z.string().email().nullable() }).strict(),
    deliveryAddress: address, installationAddress: address.nullable(),
    installationIntent: z.array(z.object({ bundleId: uuid, intent: z.record(z.string(), z.boolean()), workScope: z.array(z.unknown()).nullable() }).strict()).max(20),
    calculatorEvidence: z.array(z.object({ bundleId: uuid, source: z.literal("cctv_calculator"), calculatorVersion: z.string().min(1).max(100), calculatorInput: z.record(z.string(), z.unknown()).nullable() }).strict()).max(20),
    totals: checkoutTotals,
    lines: z.array(checkoutLine.omit({ bundleId: true, priceChanged: true, missing: true }).extend({ lineNumber: z.coerce.number().int().positive() }).strict()).max(100),
  }).strict().parse(value);
}
export function parsePublicRetailOrderCreated(value: unknown): PublicRetailOrderCreatedDto {
  return z.object({ orderNumber: z.string().regex(/^R-[0-9]{4}-[0-9]{6}$/), status: z.literal("awaiting_payment"), repeated: z.boolean(), accessExpiresAt: z.string().datetime({ offset: true }) }).strict().parse(value);
}
