import { createClient } from "@/src/lib/supabase/server";

import type { CatalogFavoriteRepository } from "../favorite.repository";
import { CatalogRepositoryUnexpectedError } from "./catalog.supabase-repository";

export class SupabaseCatalogFavoriteRepository implements CatalogFavoriteRepository {
  async exists(userId: string, companyId: string, productId: string): Promise<boolean> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("partner_product_favorites").select("product_id").eq("user_id", userId).eq("company_id", companyId).eq("product_id", productId).maybeSingle();
    if (error) throw new CatalogRepositoryUnexpectedError();
    return Boolean(data);
  }

  async add(userId: string, companyId: string, productId: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("partner_product_favorites").upsert({ user_id: userId, company_id: companyId, product_id: productId }, { onConflict: "user_id,company_id,product_id", ignoreDuplicates: true });
    if (error) throw new CatalogRepositoryUnexpectedError();
  }

  async remove(userId: string, companyId: string, productId: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("partner_product_favorites").delete().eq("user_id", userId).eq("company_id", companyId).eq("product_id", productId);
    if (error) throw new CatalogRepositoryUnexpectedError();
  }
}
