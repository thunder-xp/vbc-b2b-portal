import "server-only";

import { createPublicReadClient } from "@/src/lib/supabase/public";

import type {
  PublicRetailReadRepository,
  ListPublicRetailProductsInput,
} from "../public-retail.repository";
import {
  parsePublicRetailCategories,
  parsePublicRetailCalculatorProductResolutions,
  parsePublicRetailFacets,
  parsePublicRetailProduct,
  parsePublicRetailProductPage,
  parsePublicRetailShowcase,
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
    const client = createPublicReadClient();
    const request = input.mode === "hot"
      ? client.rpc("list_public_retail_hot_products", {
          p_locale: input.locale,
          p_limit: input.limit,
          p_offset: input.offset,
        })
      : client.rpc("list_public_retail_products_v2", {
      p_locale: input.locale,
      p_category_slug: input.categorySlug ?? null,
      p_search: input.search ?? null,
      p_availability: input.availability ?? null,
      p_facets: input.facets ?? {},
      p_mode: input.mode ?? null,
      p_limit: input.limit,
      p_offset: input.offset,
        });
    const { data, error } = await request;
    if (error) throw new PublicRetailRepositoryError();
    return parsePublicRetailProductPage(data);
  }

  async getShowcase(locale: PublicRetailLocale) {
    const { data, error } = await createPublicReadClient().rpc("get_public_retail_showcase_v2", { p_locale: locale });
    if (error) throw new PublicRetailRepositoryError();
    return parsePublicRetailShowcase(data);
  }

  async getProduct(slug: string, locale: PublicRetailLocale) {
    const { data, error } = await createPublicReadClient().rpc("get_public_retail_product", {
      p_slug: slug,
      p_locale: locale,
    });
    if (error) throw new PublicRetailRepositoryError();
    return data === null ? null : parsePublicRetailProduct(data);
  }

  async listFacets(input: Pick<ListPublicRetailProductsInput, "availability" | "categorySlug" | "facets" | "locale" | "search">) {
    const { data, error } = await createPublicReadClient().rpc("list_public_retail_facets_v2", {
      p_category_slug: input.categorySlug ?? null,
      p_search: input.search ?? null,
      p_availability: input.availability ?? null,
      p_facets: input.facets ?? {},
      p_locale: input.locale,
      p_max_values: 30,
    });
    if (error) throw new PublicRetailRepositoryError();
    return parsePublicRetailFacets(data);
  }

  async resolveCalculatorProducts(profileKeys: string[], locale: PublicRetailLocale) {
    const { data, error } = await createPublicReadClient().rpc("resolve_public_retail_calculator_products", {
      p_profile_keys: profileKeys,
      p_locale: locale,
    });
    if (error) throw new PublicRetailRepositoryError();
    return parsePublicRetailCalculatorProductResolutions(data);
  }
}
