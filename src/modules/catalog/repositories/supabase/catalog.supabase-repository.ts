import { createClient } from "@/src/lib/supabase/server";

import type {
  CatalogRepository,
  CatalogUpsertResult,
  ListCatalogProductsInput,
  CatalogAttributeFilters,
  CatalogFacetValueRecord,
  CatalogProductDetailAggregate,
  UpsertCatalogBrandInput,
  UpsertCatalogCategoryInput,
  UpsertCatalogProductInput,
} from "../catalog.repository";
import type {
  CatalogBrand,
  CatalogCategory,
  CatalogProduct,
  CatalogProductDocument,
  CatalogProductImage,
  CatalogProductAttribute,
} from "../../types";
import {
  mapCatalogBrandRow,
  mapCatalogCategoryRow,
  mapCatalogProductDocumentRow,
  mapCatalogProductImageRow,
  mapCatalogProductRow,
  mapCatalogProductAttributeRow,
  type CatalogBrandRow,
  type CatalogCategoryRow,
  type CatalogProductDocumentRow,
  type CatalogProductImageRow,
  type CatalogProductRow,
  type CatalogProductAttributeRow,
} from "./mappers";

const CATALOG_CATEGORY_COLUMNS =
  "id, external_1c_id, parent_id, name, slug, description, sort_order, is_active, created_at, updated_at";
const CATALOG_BRAND_COLUMNS =
  "id, external_1c_id, name, slug, description, logo_url, sort_order, is_active, created_at, updated_at";
const CATALOG_PRODUCT_COLUMNS =
  "id, external_1c_id, category_id, brand_id, sku, name, slug, short_description, description, image_url, image_source_url, full_description, is_active, is_visible, sort_order, created_at, updated_at";
const CATALOG_PRODUCT_ATTRIBUTE_COLUMNS = "id, product_id, property_ref, attribute_key, label, raw_value, display_value, resolved_display_value, resolution_status, value_type, is_filterable, is_visible";
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

    if (input.categoryIds?.length) {
      query = query.in("category_id", input.categoryIds);
    } else if (input.categoryId) {
      query = query.eq("category_id", input.categoryId);
    }
    if (input.productIds) { if (!input.productIds.length) return []; query = query.in("id", input.productIds); }

    if (input.brandId) {
      query = query.eq("brand_id", input.brandId);
    }

    const normalizedSearch = input.search?.trim();

    if (normalizedSearch) {
      const searchPattern = `%${normalizedSearch}%`;
      const brandFilter = input.searchBrandIds?.length
        ? `,brand_id.in.(${input.searchBrandIds.join(",")})`
        : "";
      query = query.or(`name.ilike.${searchPattern},sku.ilike.${searchPattern},short_description.ilike.${searchPattern}${brandFilter}`);
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

  async countProducts(input: ListCatalogProductsInput): Promise<number> {
    const supabase = await createClient();
    let query = supabase
      .from("catalog_products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("is_visible", true);

    if (input.categoryIds?.length) query = query.in("category_id", input.categoryIds);
    else if (input.categoryId) query = query.eq("category_id", input.categoryId);
    if (input.productIds) { if (!input.productIds.length) return 0; query = query.in("id", input.productIds); }
    if (input.brandId) query = query.eq("brand_id", input.brandId);
    const normalizedSearch = input.search?.trim();
    if (normalizedSearch) {
      const searchPattern = `%${normalizedSearch}%`;
      const brandFilter = input.searchBrandIds?.length ? `,brand_id.in.(${input.searchBrandIds.join(",")})` : "";
      query = query.or(`name.ilike.${searchPattern},sku.ilike.${searchPattern},short_description.ilike.${searchPattern}${brandFilter}`);
    }

    const { count, error } = await query;
    if (error) throw new CatalogRepositoryUnexpectedError();
    return count ?? 0;
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

  async getProductDetailAggregateById(id: string): Promise<CatalogProductDetailAggregate | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("catalog_products")
      .select(`${CATALOG_PRODUCT_COLUMNS}, brand:catalog_brands(${CATALOG_BRAND_COLUMNS}), category:catalog_categories(${CATALOG_CATEGORY_COLUMNS}), images:catalog_product_images(${CATALOG_PRODUCT_IMAGE_COLUMNS}), documents:catalog_product_documents(${CATALOG_PRODUCT_DOCUMENT_COLUMNS}), attributes:catalog_product_attributes(${CATALOG_PRODUCT_ATTRIBUTE_COLUMNS})`)
      .eq("id", id)
      .eq("is_active", true)
      .eq("is_visible", true)
      .maybeSingle();

    if (error) throw new CatalogRepositoryUnexpectedError();
    if (!data) return null;

    const row = data as unknown as CatalogProductRow & {
      brand: CatalogBrandRow | null;
      category: CatalogCategoryRow | null;
      images: CatalogProductImageRow[];
      documents: CatalogProductDocumentRow[];
      attributes: CatalogProductAttributeRow[];
    };
    return {
      product: mapCatalogProductRow(row),
      brand: row.brand?.is_active ? mapCatalogBrandRow(row.brand) : null,
      category: row.category?.is_active ? mapCatalogCategoryRow(row.category) : null,
      images: row.images.map(mapCatalogProductImageRow),
      documents: row.documents.filter((document) => document.is_active).map(mapCatalogProductDocumentRow),
      attributes: row.attributes.filter((attribute) => attribute.is_visible).map(mapCatalogProductAttributeRow),
    };
  }

  async findCategoryByExternal1cId(
    external1cId: string,
  ): Promise<CatalogCategory | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("catalog_categories")
      .select(CATALOG_CATEGORY_COLUMNS)
      .eq("external_1c_id", external1cId)
      .maybeSingle();

    if (error) {
      throw new CatalogRepositoryUnexpectedError();
    }

    return data ? mapCatalogCategoryRow(data as CatalogCategoryRow) : null;
  }

  async findBrandByExternal1cId(
    external1cId: string,
  ): Promise<CatalogBrand | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("catalog_brands")
      .select(CATALOG_BRAND_COLUMNS)
      .eq("external_1c_id", external1cId)
      .maybeSingle();

    if (error) {
      throw new CatalogRepositoryUnexpectedError();
    }

    return data ? mapCatalogBrandRow(data as CatalogBrandRow) : null;
  }

  async findProductByExternal1cId(
    external1cId: string,
  ): Promise<CatalogProduct | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("catalog_products")
      .select(CATALOG_PRODUCT_COLUMNS)
      .eq("external_1c_id", external1cId)
      .maybeSingle();

    if (error) {
      throw new CatalogRepositoryUnexpectedError();
    }

    return data ? mapCatalogProductRow(data as CatalogProductRow) : null;
  }

  async findProductBySku(sku: string): Promise<CatalogProduct | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("catalog_products")
      .select(CATALOG_PRODUCT_COLUMNS)
      .eq("sku", sku)
      .maybeSingle();

    if (error) {
      throw new CatalogRepositoryUnexpectedError();
    }

    return data ? mapCatalogProductRow(data as CatalogProductRow) : null;
  }

  async upsertCategory(
    input: UpsertCatalogCategoryInput,
  ): Promise<CatalogUpsertResult<CatalogCategory>> {
    const supabase = await createClient();
    const existing = await this.findCategoryByExternal1cId(input.external1cId);
    const payload = {
      external_1c_id: input.external1cId,
      parent_id: input.parentId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      sort_order: input.sortOrder ?? 0,
      is_active: input.isActive,
    };
    const query = existing
      ? supabase
          .from("catalog_categories")
          .update(payload)
          .eq("external_1c_id", input.external1cId)
      : supabase.from("catalog_categories").insert(payload);
    const { data, error } = await query
      .select(CATALOG_CATEGORY_COLUMNS)
      .single();

    if (error || !data) {
      throw new CatalogRepositoryUnexpectedError();
    }

    return {
      record: mapCatalogCategoryRow(data as CatalogCategoryRow),
      created: !existing,
    };
  }

  async upsertBrand(
    input: UpsertCatalogBrandInput,
  ): Promise<CatalogUpsertResult<CatalogBrand>> {
    const supabase = await createClient();
    const existing = await this.findBrandByExternal1cId(input.external1cId);
    const payload = {
      external_1c_id: input.external1cId,
      name: input.name,
      slug: input.slug,
      description: input.description,
      logo_url: input.logoUrl,
      sort_order: input.sortOrder ?? 0,
      is_active: input.isActive,
    };
    const query = existing
      ? supabase
          .from("catalog_brands")
          .update(payload)
          .eq("external_1c_id", input.external1cId)
      : supabase.from("catalog_brands").insert(payload);
    const { data, error } = await query.select(CATALOG_BRAND_COLUMNS).single();

    if (error || !data) {
      throw new CatalogRepositoryUnexpectedError();
    }

    return {
      record: mapCatalogBrandRow(data as CatalogBrandRow),
      created: !existing,
    };
  }

  async upsertProduct(
    input: UpsertCatalogProductInput,
  ): Promise<CatalogUpsertResult<CatalogProduct>> {
    const supabase = await createClient();
    const existing = await this.findProductByExternal1cId(input.external1cId);
    const payload = {
      external_1c_id: input.external1cId,
      category_id: input.categoryId,
      brand_id: input.brandId,
      sku: input.sku,
      name: input.name,
      slug: input.slug,
      short_description: input.shortDescription,
      description: input.description,
      image_url: input.imageUrl,
      sort_order: input.sortOrder ?? 0,
      is_active: input.isActive,
      is_visible: input.isVisible,
    };
    const query = existing
      ? supabase
          .from("catalog_products")
          .update(payload)
          .eq("external_1c_id", input.external1cId)
      : supabase.from("catalog_products").insert(payload);
    const { data, error } = await query
      .select(CATALOG_PRODUCT_COLUMNS)
      .single();

    if (error || !data) {
      throw new CatalogRepositoryUnexpectedError();
    }

    return {
      record: mapCatalogProductRow(data as CatalogProductRow),
      created: !existing,
    };
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

  async listProductDocumentsForProducts(
    productIds: string[],
  ): Promise<CatalogProductDocument[]> {
    if (productIds.length === 0) return [];
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("catalog_product_documents")
      .select(CATALOG_PRODUCT_DOCUMENT_COLUMNS)
      .in("product_id", productIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) throw new CatalogRepositoryUnexpectedError();
    return (data as CatalogProductDocumentRow[]).map(mapCatalogProductDocumentRow);
  }

  async listProductAttributes(productId: string): Promise<CatalogProductAttribute[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("catalog_product_attributes").select(CATALOG_PRODUCT_ATTRIBUTE_COLUMNS).eq("product_id", productId).eq("is_visible", true).order("label");
    if (error) throw new CatalogRepositoryUnexpectedError();
    return (data as CatalogProductAttributeRow[]).map(mapCatalogProductAttributeRow);
  }

  async listProductAttributesForProducts(productIds: string[]): Promise<CatalogProductAttribute[]> {
    if (!productIds.length) return [];
    const supabase = await createClient();
    const { data, error } = await supabase.from("catalog_product_attributes").select(CATALOG_PRODUCT_ATTRIBUTE_COLUMNS).in("product_id", productIds).eq("is_visible", true).order("label");
    if (error) throw new CatalogRepositoryUnexpectedError();
    return (data as CatalogProductAttributeRow[]).map(mapCatalogProductAttributeRow);
  }

  async findMatchingProductIds(categoryIds: string[] | undefined, filters: CatalogAttributeFilters): Promise<string[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("catalog_matching_product_ids", { p_category_ids: categoryIds ?? null, p_filters: filters });
    if (error) throw new CatalogRepositoryUnexpectedError();
    return ((data ?? []) as Array<{ product_id: string }>).map((row) => row.product_id);
  }

  async listAttributeFacets(categoryIds: string[] | undefined, filters: CatalogAttributeFilters): Promise<CatalogFacetValueRecord[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("catalog_attribute_facets", { p_category_ids: categoryIds ?? null, p_filters: filters });
    if (error) throw new CatalogRepositoryUnexpectedError();
    return ((data ?? []) as Array<{ attribute_key: string; label: string; display_value: string; product_count: number; product_coverage: number }>).map((row) => ({ key: row.attribute_key, label: row.label, value: row.display_value, count: Number(row.product_count), coverage: Number(row.product_coverage) }));
  }
}
