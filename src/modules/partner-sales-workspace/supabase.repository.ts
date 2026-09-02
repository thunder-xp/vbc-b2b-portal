import "server-only";

import { createClient } from "@/src/lib/supabase/server";
import { z } from "zod";

import type { EstimateSalesOpportunityRepository } from "./repository";

const estimateSchema = z.object({ name: z.string(), customer_name: z.string().nullable(), project_name: z.string().nullable(), status: z.enum(["draft", "ready", "sent", "accepted", "rejected", "archived"]), lifecycle_status: z.enum(["draft", "sent"]) });
const rowSchema = z.object({
  id: z.string().uuid(), estimate_id: z.string().uuid(), estimate_number: z.string(), currency_code: z.string(),
  total_amount: z.union([z.number(), z.string()]), status: z.enum(["prepared", "sent"]), sent_at: z.string().nullable(), created_at: z.string(),
  estimate: z.union([estimateSchema, z.array(estimateSchema).length(1)]),
  documents: z.array(z.object({ id: z.string().uuid(), status: z.string(), created_at: z.string() })),
});

export class SupabaseEstimateSalesOpportunityRepository implements EstimateSalesOpportunityRepository {
  async listCurrent(companyId: string, limit: number) {
    const { data, error } = await (await createClient()).from("estimate_versions")
      .select("id, estimate_id, estimate_number, currency_code, total_amount, status, sent_at, created_at, estimate:estimates!estimate_versions_estimate_id_fkey!inner(name, customer_name, project_name, status, lifecycle_status), documents:generated_estimate_documents!generated_estimate_documents_version_id_fkey(id, status, created_at)")
      .eq("company_id", companyId)
      .in("status", ["prepared", "sent"])
      .neq("estimate.status", "archived")
      .in("estimate.lifecycle_status", ["draft", "sent"])
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
      versionStatus: row.status, estimateStatus: estimate.status, estimateLifecycleStatus: estimate.lifecycle_status, sentAt: row.sent_at, createdAt: row.created_at,
      readyDocumentId: row.documents.filter((document) => document.status === "ready").sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id ?? null,
    });
    });
  }
}
