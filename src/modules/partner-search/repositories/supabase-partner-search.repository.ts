import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "../../access-control/repositories";
import type { PartnerSearchResult, PartnerSearchDocumentType } from "../types";
import type { PartnerSearchRepository } from "./partner-search.repository";

type SearchRow = {
  document_type: PartnerSearchDocumentType;
  document_id: string;
  title: string;
  subtitle: string | null;
  route: string;
  updated_at: string;
};

export class SupabasePartnerSearchRepository implements PartnerSearchRepository {
  async search(companyId: string, query: string, limit: number): Promise<PartnerSearchResult[]> {
    const supabase = await createClient();
    const [workspace, documents, serviceCases, supportTickets, knowledge] = await Promise.all([
      supabase.rpc("search_partner_workspace", { p_company_id: companyId, p_query: query, p_limit: limit }),
      supabase.rpc("search_partner_documents", { p_company_id: companyId, p_query: query, p_limit: Math.min(10, limit) }),
      supabase.rpc("search_partner_service_cases", { p_company_id: companyId, p_query: query, p_limit: Math.min(10, limit) }),
      supabase.rpc("search_partner_support_tickets", { p_company_id: companyId, p_query: query, p_limit: Math.min(10, limit) }),
      supabase.rpc("search_partner_knowledge", { p_company_id: companyId, p_query: query, p_limit: Math.min(10, limit), p_source: "global" }),
    ]);
    if (workspace.error || documents.error || serviceCases.error || supportTickets.error || knowledge.error) throw new RepositoryUnexpectedError();
    return ([...((workspace.data ?? []) as SearchRow[]), ...((documents.data ?? []) as SearchRow[]), ...((serviceCases.data ?? []) as SearchRow[]), ...((supportTickets.data ?? []) as SearchRow[]), ...((knowledge.data ?? []) as SearchRow[])]).map((row) => ({
      documentType: row.document_type,
      documentId: row.document_id,
      title: row.title,
      subtitle: row.subtitle,
      route: row.route,
      updatedAt: row.updated_at,
    }));
  }
}
