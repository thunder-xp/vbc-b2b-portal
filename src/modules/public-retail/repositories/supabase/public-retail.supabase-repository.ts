import "server-only";

import { createPublicReadClient } from "@/src/lib/supabase/public";

import type {
  PublicRetailReadRepository,
  ListPublicRetailProductsInput,
} from "../public-retail.repository";
import {
  parsePublicRetailCategories,
  parsePublicRetailFacets,
  parsePublicRetailProduct,
  parsePublicRetailProductPage,
} from "../../validation";
import type { PublicRetailLocale } from "../../types";

export class PublicRetailRepositoryError extends Error {
  constructor() {
    super("Public Retail projection is temporarily unavailable.");
    this.name = "PublicRetailRepositoryError";
  }
}

export class SupabasePublicRetailReadRepository implements PublicRetailReadRepository {
  async listCategories(locale: PublicRetailLocale) {
    const { data, error } = await createPublicReadClient().rpc("list_public_retail_categories", { p_locale: locale });
    if (error) throw new PublicRetailRepositoryError();
    return parsePublicRetailCategories(data);
  }

  async listProducts(input: ListPublicRetailProductsInput) {
    const { data, error } = await createPublicReadClient().rpc("list_public_retail_products", {
      p_locale: input.locale,
      p_category_slug: input.categorySlug ?? null,
      p_search: input.search ?? null,
      p_availability: input.availability ?? null,
      p_facets: input.facets ?? {},
      p_limit: input.limit,
      p_offset: input.offset,
    });
    if (error) throw new PublicRetailRepositoryError();
    return parsePublicRetailProductPage(data);
  }

  async getProduct(slug: string, locale: PublicRetailLocale) {
    const { data, error } = await createPublicReadClient().rpc("get_public_retail_product", {
      p_slug: slug,
      p_locale: locale,
    });
    if (error) throw new PublicRetailRepositoryError();
    return data === null ? null : parsePublicRetailProduct(data);
  }

  async listFacets(categorySlug: string | undefined, locale: PublicRetailLocale) {
    const { data, error } = await createPublicReadClient().rpc("list_public_retail_facets", {
      p_category_slug: categorySlug ?? null,
      p_locale: locale,
    });
    if (error) throw new PublicRetailRepositoryError();
    return parsePublicRetailFacets(data);
  }
}
