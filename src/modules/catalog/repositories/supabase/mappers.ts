import type {
  CatalogBrand,
  CatalogCategory,
  CatalogProduct,
  CatalogProductDocument,
  CatalogProductDocumentType,
  CatalogProductImage,
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
  is_active: boolean;
  is_visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

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
    isActive: row.is_active,
    isVisible: row.is_visible,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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
