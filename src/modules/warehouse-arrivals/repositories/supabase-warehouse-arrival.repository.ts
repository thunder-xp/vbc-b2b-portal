import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { z } from "zod";

import { WarehouseArrivalRepositoryError, type WarehouseArrivalRepository } from "./warehouse-arrival.repository";

const summarySchema = z.object({
  id: z.string().uuid(),
  completedAt: z.string(),
  productCount: z.coerce.number().int().nonnegative(),
  availableProductCount: z.coerce.number().int().nonnegative(),
  availableUnits: z.coerce.number().nonnegative(),
  seen: z.boolean(),
});
const pageSchema = z.object({ items: z.array(summarySchema), totalCount: z.coerce.number().int().nonnegative() });
const detailSchema = z.object({
  id: z.string().uuid(),
  completedAt: z.string(),
  productCount: z.coerce.number().int().nonnegative(),
  seen: z.boolean(),
  productIds: z.array(z.string().uuid()).max(500),
});
const currentReplenishmentSchema = z.object({
  items: z.array(z.object({
    productId: z.string().uuid(),
    sourceLineNumber: z.coerce.number().int().positive(),
  }).strict()).max(500),
}).strict();

export class SupabaseWarehouseArrivalRepository implements WarehouseArrivalRepository {
  async list(companyId: string, input: Parameters<WarehouseArrivalRepository["list"]>[1]) {
    const { data, error } = await (await createClient()).rpc("list_partner_warehouse_arrivals", {
      p_company_id: companyId,
      p_from: input.from ?? null,
      p_to: input.to ?? null,
      p_brand_id: input.brandId ?? null,
      p_category_id: input.categoryId ?? null,
      p_availability: input.availability,
      p_unseen_only: input.unseenOnly,
      p_limit: input.pageSize,
      p_offset: input.offset,
    });
    const parsed = pageSchema.safeParse(data);
    if (error || !parsed.success) throw new WarehouseArrivalRepositoryError();
    return parsed.data;
  }

  async get(companyId: string, arrivalId: string) {
    const { data, error } = await (await createClient()).rpc("get_partner_warehouse_arrival", {
      p_company_id: companyId,
      p_arrival_id: arrivalId,
    });
    if (error) throw new WarehouseArrivalRepositoryError();
    if (data === null) return null;
    const parsed = detailSchema.safeParse(data);
    if (!parsed.success) throw new WarehouseArrivalRepositoryError();
    return parsed.data;
  }

  async markSeen(companyId: string, arrivalId: string) {
    const { error } = await (await createClient()).rpc("mark_partner_warehouse_arrival_seen", {
      p_company_id: companyId,
      p_arrival_id: arrivalId,
    });
    if (error) throw new WarehouseArrivalRepositoryError();
  }

  async getCurrentReplenishment(companyId: string) {
    const { data, error } = await (await createClient()).rpc(
      "get_partner_current_warehouse_replenishment",
      { p_company_id: companyId },
    );
    const parsed = currentReplenishmentSchema.safeParse(data);
    if (error || !parsed.success) throw new WarehouseArrivalRepositoryError();
    return parsed.data.items;
  }
}
