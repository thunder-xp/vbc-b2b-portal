import { createClient } from "@/src/lib/supabase/server";

import type {
  CatalogRepository,
  ListCatalogProductsInput,
} from "../catalog.repository";
import type {
  CatalogBrand,
  CatalogCategory,
  CatalogProduct,
  CatalogProductDocument,
  CatalogProductImage,
} from "../../types";
import {
  mapCatalogBrandRow,
  mapCatalogCategoryRow,
  mapCatalogProductDocumentRow,
  mapCatalogProductImageRow,
  mapCatalogProductRow,
  type CatalogBrandRow,
  type CatalogCategoryRow,
  type CatalogProductDocumentRow,
  type CatalogProductImageRow,
  type CatalogProductRow,
} from "./mappers";

const CATALOG_CATEGORY_COLUMNS =
  "id, external_1c_id, parent_id, name, slug, description, sort_order, is_active, created_at, updated_at";
const CATALOG_BRAND_COLUMNS =
  "id, external_1c_id, name, slug, description, logo_url, sort_order, is_active, created_at, updated_at";
const CATALOG_PRODUCT_COLUMNS =
  "id, external_1c_id, category_id, brand_id, sku, name, slug, short_description, description, image_url, is_active, is_visible, sort_order, created_at, updated_at";
const CATALOG_PRODUCT_IMAGE_COLUMNS =
  "id, product_id, url, alt_text, sort_order, is_primary, created_at";
const CATALOG_PRODUCT_DOCUMENT_COLUMNS =
  "id, product_id, title, document_type, url, sort_order, is_active, created_at";

export class CatalogRepositoryUnexpectedError extends Error {
  constructor() {
    super("Catalog repository operation failed.");
    this.name = "CatalogRepositoryUnexpectedError";
  }
}

export class SupabaseCatalogRepository implements CatalogRepository {
  async listCategories(): Promise<CatalogCategory[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("catalog_categories")
      .select(CATALOG_CATEGORY_COLUMNS)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      throw new CatalogRepositoryUnexpectedError();
    }

    return (data as CatalogCategoryRow[]).map(mapCatalogCategoryRow);
  }

  async listBrands(): Promise<CatalogBrand[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("catalog_brands")
      .select(CATALOG_BRAND_COLUMNS)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      throw new CatalogRepositoryUnexpectedError();
    }

    return (data as CatalogBrandRow[]).map(mapCatalogBrandRow);
  }

  async listProducts(
    input: ListCatalogProductsInput,
  ): Promise<CatalogProduct[]> {
    const supabase = await createClient();
    let query = supabase
      .from("catalog_products")
      .select(CATALOG_PRODUCT_COLUMNS)
      .eq("is_active", true)
      .eq("is_visible", true);

    if (input.categoryId) {
      query = query.eq("category_id", input.categoryId);
    }

    if (input.brandId) {
      query = query.eq("brand_id", input.brandId);
    }

    const normalizedSearch = input.search?.trim();

    if (normalizedSearch) {
      const searchPattern = `%${normalizedSearch}%`;
      query = query.or(`name.ilike.${searchPattern},sku.ilike.${searchPattern}`);
    }

    query = query
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (input.limit !== undefined) {
      const offset = input.offset ?? 0;
      query = query.range(offset, offset + input.limit - 1);
    }

    const { data, error } = await query;

    if (error) {
      throw new CatalogRepositoryUnexpectedError();
    }

    return (data as CatalogProductRow[]).map(mapCatalogProductRow);
  }

  async getProductBySlug(slug: string): Promise<CatalogProduct | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("catalog_products")
      .select(CATALOG_PRODUCT_COLUMNS)
      .eq("slug", slug)
      .eq("is_active", true)
      .eq("is_visible", true)
      .maybeSingle();

    if (error) {
      throw new CatalogRepositoryUnexpectedError();
    }

    return data ? mapCatalogProductRow(data as CatalogProductRow) : null;
  }

  async getProductById(id: string): Promise<CatalogProduct | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("catalog_products")
      .select(CATALOG_PRODUCT_COLUMNS)
      .eq("id", id)
      .eq("is_active", true)
      .eq("is_visible", true)
      .maybeSingle();

    if (error) {
      throw new CatalogRepositoryUnexpectedError();
    }

    return data ? mapCatalogProductRow(data as CatalogProductRow) : null;
  }

  async listProductImages(productId: string): Promise<CatalogProductImage[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("catalog_product_images")
      .select(CATALOG_PRODUCT_IMAGE_COLUMNS)
      .eq("product_id", productId)
      .order("sort_order", { ascending: true });

    if (error) {
      throw new CatalogRepositoryUnexpectedError();
    }

    return (data as CatalogProductImageRow[]).map(mapCatalogProductImageRow);
  }

  async listProductDocuments(
    productId: string,
  ): Promise<CatalogProductDocument[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("catalog_product_documents")
      .select(CATALOG_PRODUCT_DOCUMENT_COLUMNS)
      .eq("product_id", productId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      throw new CatalogRepositoryUnexpectedError();
    }

    return (data as CatalogProductDocumentRow[]).map(
      mapCatalogProductDocumentRow,
    );
  }
}
