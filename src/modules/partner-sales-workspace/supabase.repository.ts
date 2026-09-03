import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { z } from "zod";

import type { EstimateSalesOpportunityRepository } from "./repository";

const cartSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  created_by: z.string().uuid(),
  status: z.enum(["active", "submitting", "converted", "abandoned"]),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.union([z.number(), z.string()]),
  })),
});
const conversionSchema = z.object({
  version_id: z.string().uuid().nullable(),
  request_key: z.string().uuid(),
  created_by: z.string().uuid(),
  direction: z.enum(["cart_to_estimate", "estimate_to_cart"]),
  cart: z.union([cartSchema, z.array(cartSchema).length(1)]).nullable(),
});
const estimateSchema = z.object({
  name: z.string(),
  customer_name: z.string().nullable(),
  project_name: z.string().nullable(),
  status: z.enum(["draft", "ready", "sent", "accepted", "rejected", "archived"]),
  lifecycle_status: z.enum(["draft", "sent", "accepted"]),
  accepted_version_id: z.string().uuid().nullable(),
  conversions: z.array(conversionSchema),
});
const rowSchema = z.object({
  id: z.string().uuid(), estimate_id: z.string().uuid(), estimate_number: z.string(), currency_code: z.string(),
  total_amount: z.union([z.number(), z.string()]), status: z.enum(["prepared", "sent", "accepted"]), sent_at: z.string().nullable(), accepted_at: z.string().nullable(), created_at: z.string(),
  product_requirements: z.array(z.object({
    line_type: z.string(),
    product_id: z.string().uuid().nullable().optional(),
    quantity: z.union([z.number(), z.string()]).optional(),
  }).passthrough()),
  estimate: z.union([estimateSchema, z.array(estimateSchema).length(1)]),
  documents: z.array(z.object({ id: z.string().uuid(), status: z.string(), created_at: z.string() })),
});

export class SupabaseEstimateSalesOpportunityRepository implements EstimateSalesOpportunityRepository {
  async listCurrent(companyId: string, _userId: string, limit: number) {
    const { data, error } = await (await createClient()).from("estimate_versions")
      .select("id, estimate_id, estimate_number, currency_code, total_amount, status, sent_at, accepted_at, created_at, product_requirements:snapshot->items, estimate:estimates!estimate_versions_estimate_id_fkey!inner(name, customer_name, project_name, status, lifecycle_status, accepted_version_id, conversions:estimate_cart_conversions!estimate_cart_conversions_estimate_id_fkey(version_id, request_key, created_by, direction, cart:carts!estimate_cart_conversions_cart_id_fkey(id, company_id, created_by, status, items:cart_items!cart_items_cart_id_fkey(product_id, quantity)))), documents:generated_estimate_documents!generated_estimate_documents_version_id_fkey(id, status, created_at)")
      .eq("company_id", companyId)
      .in("status", ["prepared", "sent", "accepted"])
      .neq("estimate.status", "archived")
      .in("estimate.lifecycle_status", ["draft", "sent", "accepted"])
      .order("created_at", { ascending: false })
      .limit(Math.min(32, Math.max(limit, limit * 4)));
    const parsed = z.array(rowSchema).safeParse(data ?? []);
    if (error || !parsed.success) {
      console.error({ event: "estimate_sales_opportunity_projection_failed", databaseCode: error?.code ?? null, schemaPaths: parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join(".")) });
      throw new Error("Estimate sales opportunity projection failed.");
    }
    return parsed.data.map((row) => {
      const estimate = Array.isArray(row.estimate) ? row.estimate[0] : row.estimate;
      return ({
      versionId: row.id, estimateId: row.estimate_id, estimateNumber: row.estimate_number, proposalName: estimate.name,
      customerName: estimate.customer_name, projectName: estimate.project_name, amount: Number(row.total_amount), currency: row.currency_code,
      versionStatus: row.status, estimateStatus: estimate.status, estimateLifecycleStatus: estimate.lifecycle_status, acceptedVersionId: estimate.accepted_version_id,
      sentAt: row.sent_at, acceptedAt: row.accepted_at, createdAt: row.created_at,
      readyDocumentId: row.documents.filter((document) => document.status === "ready").sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id ?? null,
      productRequirements: row.product_requirements.flatMap((item) => item.line_type === "product" && item.product_id && Number(item.quantity) > 0
        ? [{ productId: item.product_id, quantity: Number(item.quantity) }]
        : []),
      cartConversions: estimate.conversions.map((conversion) => {
        const cart = Array.isArray(conversion.cart) ? conversion.cart[0] : conversion.cart;
        return {
          versionId: conversion.version_id,
          requestKey: conversion.request_key,
          createdBy: conversion.created_by,
          direction: conversion.direction,
          cart: cart ? {
            id: cart.id,
            companyId: cart.company_id,
            createdBy: cart.created_by,
            status: cart.status,
            items: cart.items.map((item) => ({ productId: item.product_id, quantity: Number(item.quantity) })),
          } : null,
        };
      }),
    });
    });
  }
}
