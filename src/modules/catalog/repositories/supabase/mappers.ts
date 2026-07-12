import type {
  CatalogBrand,
  CatalogCategory,
  CatalogProduct,
  CatalogProductDocument,
  CatalogProductDocumentType,
  CatalogProductImage,
  CatalogProductAttribute,
} from "../../types";

export interface CatalogCategoryRow {
  id: string;
  external_1c_id: string | null;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatalogBrandRow {
  id: string;
  external_1c_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatalogProductRow {
  id: string;
  external_1c_id: string;
  category_id: string | null;
  brand_id: string | null;
  sku: string;
  name: string;
  slug: string;
  short_description: string | null;
  description: string | null;
  image_url: string | null;
  image_source_url: string | null;
  full_description: string | null;
  is_active: boolean;
  is_visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CatalogProductAttributeRow { id: string; product_id: string; property_ref: string; attribute_key: string; label: string; raw_value: unknown; display_value: string; resolved_display_value: string | null; resolution_status: "not_required" | "resolved" | "unresolved" | "invalid"; value_type: string | null; is_filterable: boolean; is_visible: boolean; }

export interface CatalogProductImageRow {
  id: string;
  product_id: string;
  url: string;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

export interface CatalogProductDocumentRow {
  id: string;
  product_id: string;
  title: string;
  document_type: CatalogProductDocumentType;
  url: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export function mapCatalogCategoryRow(
  row: CatalogCategoryRow,
): CatalogCategory {
  return {
    id: row.id,
    external1cId: row.external_1c_id,
    parentId: row.parent_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCatalogBrandRow(row: CatalogBrandRow): CatalogBrand {
  return {
    id: row.id,
    external1cId: row.external_1c_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    logoUrl: row.logo_url,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCatalogProductRow(row: CatalogProductRow): CatalogProduct {
  return {
    id: row.id,
    external1cId: row.external_1c_id,
    categoryId: row.category_id,
    brandId: row.brand_id,
    sku: row.sku,
    name: row.name,
    slug: row.slug,
    shortDescription: row.short_description,
    description: row.description,
    imageUrl: row.image_url,
    imageSourceUrl: row.image_source_url,
    fullDescription: row.full_description,
    isActive: row.is_active,
    isVisible: row.is_visible,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCatalogProductAttributeRow(row: CatalogProductAttributeRow): CatalogProductAttribute { return { id: row.id, productId: row.product_id, propertyRef: row.property_ref, key: row.attribute_key, label: row.label, rawValue: row.raw_value, displayValue: publicAttributeValue(row), resolvedDisplayValue: row.resolved_display_value, resolutionStatus: row.resolution_status, valueType: row.value_type, isFilterable: row.is_filterable, isVisible: row.is_visible }; }
function publicAttributeValue(row: CatalogProductAttributeRow): string { if (row.resolution_status === "resolved") return row.resolved_display_value?.trim() ?? ""; if (row.resolution_status !== "not_required") return ""; const value = row.display_value.trim(); return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? "" : value; }

export function mapCatalogProductImageRow(
  row: CatalogProductImageRow,
): CatalogProductImage {
  return {
    id: row.id,
    productId: row.product_id,
    url: row.url,
    altText: row.alt_text,
    sortOrder: row.sort_order,
    isPrimary: row.is_primary,
    createdAt: row.created_at,
  };
}

export function mapCatalogProductDocumentRow(
  row: CatalogProductDocumentRow,
): CatalogProductDocument {
  return {
    id: row.id,
    productId: row.product_id,
    title: row.title,
    documentType: row.document_type,
    url: row.url,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}
