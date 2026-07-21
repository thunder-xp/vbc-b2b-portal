import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import type { CustomerProposalDto, GeneratedEstimateDocument, ProposalBranding, ProposalSettings, ProposalTemplate } from "../../types";
import type { ProposalRepository } from "../proposal.repository";
import { ProposalRepositoryError } from "../proposal.repository";

type TemplateRow = { id: string; company_id: string | null; template_key: string; name: string; configuration: ProposalSettings; is_system: boolean };
type DocumentRow = {
  id: string; company_id: string; estimate_id: string; estimate_revision: number; template_id: string | null;
  version_id: string | null;
  generation_fingerprint: string; status: GeneratedEstimateDocument["status"]; storage_bucket: string | null;
  storage_key: string | null; page_count: number | null; file_size_bytes: number | null; checksum_sha256: string | null;
  safe_error: string | null; created_at: string;
};

const DOCUMENT_COLUMNS = "id, company_id, estimate_id, estimate_revision, version_id, template_id, generation_fingerprint, status, storage_bucket, storage_key, page_count, file_size_bytes, checksum_sha256, safe_error, created_at";

export class SupabaseProposalRepository implements ProposalRepository {
  async listTemplates(companyId: string): Promise<ProposalTemplate[]> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("proposal_templates")
      .select("id, company_id, template_key, name, configuration, is_system")
      .or(`company_id.is.null,company_id.eq.${companyId}`).eq("is_active", true)
      .order("is_system", { ascending: false }).order("name");
    if (error) throw new ProposalRepositoryError();
    return (data as TemplateRow[]).map((row) => ({ id: row.id, companyId: row.company_id, key: row.template_key, name: row.name, configuration: row.configuration, isSystem: row.is_system }));
  }

  async getBranding(companyId: string): Promise<Partial<ProposalBranding> | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.from("company_proposal_profiles")
      .select("legal_name, contact_name, phone, email, website, fiscal_information, address, logo_url")
      .eq("company_id", companyId).maybeSingle();
    if (error) throw new ProposalRepositoryError();
    if (!data) return null;
    return { legalName: data.legal_name, contactName: data.contact_name, phone: data.phone, email: data.email, website: data.website, fiscalInformation: data.fiscal_information, address: data.address, logoUrl: data.logo_url };
  }

  async getProductImages(productIds: string[]): Promise<Map<string, string | null>> {
    if (!productIds.length) return new Map();
    const supabase = await createClient();
    const { data, error } = await supabase.from("catalog_products").select("id, image_source_url, image_url").in("id", [...new Set(productIds)]);
    if (error) throw new ProposalRepositoryError();
    return new Map((data ?? []).map((row) => [row.id, row.image_source_url ?? row.image_url]));
  }

  async saveSettings(input: { estimateId: string; expectedRevision: number; templateId: string | null; settings: ProposalSettings }): Promise<number> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_estimate_proposal_settings", {
      target_estimate_id: input.estimateId, expected_revision: input.expectedRevision,
      target_template_id: input.templateId, settings_payload: input.settings,
    });
    if (error || !data) throw new ProposalRepositoryError();
    return Number((data as { revision: number }).revision);
  }

  async copyTemplate(input: { companyId: string; sourceTemplateId: string; name: string }): Promise<ProposalTemplate> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("copy_proposal_template", { target_company_id: input.companyId, source_template_id: input.sourceTemplateId, target_name: input.name });
    if (error || !data) throw new ProposalRepositoryError();
    const row = data as TemplateRow;
    return { id: row.id, companyId: row.company_id, key: row.template_key, name: row.name, configuration: row.configuration, isSystem: row.is_system };
  }

  async claimGeneration(input: { estimateId: string; estimateRevision: number; templateId: string | null; fingerprint: string; dto: CustomerProposalDto }) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("claim_estimate_document_generation", {
      target_estimate_id: input.estimateId, target_revision: input.estimateRevision, target_template_id: input.templateId,
      target_fingerprint: input.fingerprint, target_prepared_dto: input.dto,
    });
    if (error || !data) throw new ProposalRepositoryError();
    return mapDocument(data as DocumentRow);
  }

  async findVersionProposal(versionId: string) {
    const { data, error } = await (await createClient()).from("estimate_versions")
      .select("estimate_id, company_id, version_number, customer_proposal_snapshot").eq("id", versionId).maybeSingle();
    if (error) throw new ProposalRepositoryError();
    return data ? { estimateId: data.estimate_id, companyId: data.company_id, versionNumber: data.version_number, proposal: data.customer_proposal_snapshot as CustomerProposalDto } : null;
  }

  async claimVersionGeneration(input: { versionId: string; fingerprint: string }) {
    const { data, error } = await (await createClient()).rpc("claim_estimate_version_document_generation", {
      target_version_id: input.versionId,
      target_fingerprint: input.fingerprint,
    });
    if (error || !data) throw new ProposalRepositoryError();
    return mapDocument(data as DocumentRow);
  }

  async markGenerating(documentId: string) { await this.updateDocument(documentId, { status: "generating", safe_error: null }); }
  async markReady(input: { documentId: string; bucket: string; key: string; pageCount: number; fileSizeBytes: number; checksumSha256: string }) {
    await this.updateDocument(input.documentId, { status: "ready", storage_bucket: input.bucket, storage_key: input.key, page_count: input.pageCount, file_size_bytes: input.fileSizeBytes, checksum_sha256: input.checksumSha256, generated_at: new Date().toISOString(), safe_error: null });
  }
  async markFailed(documentId: string, safeError: string) { await this.updateDocument(documentId, { status: "failed", safe_error: safeError.slice(0, 500) }); }

  async findDocument(documentId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase.from("generated_estimate_documents").select(DOCUMENT_COLUMNS).eq("id", documentId).maybeSingle();
    if (error) throw new ProposalRepositoryError();
    return data ? mapDocument(data as DocumentRow) : null;
  }

  async uploadPdf(bucket: string, key: string, data: Uint8Array) {
    const { error } = await createAdminClient().storage.from(bucket).upload(key, data, { contentType: "application/pdf", upsert: true });
    if (error) throw new ProposalRepositoryError();
  }

  async downloadPdf(bucket: string, key: string): Promise<Uint8Array> {
    const { data, error } = await createAdminClient().storage.from(bucket).download(key);
    if (error || !data) throw new ProposalRepositoryError();
    return new Uint8Array(await data.arrayBuffer());
  }

  private async updateDocument(documentId: string, values: Record<string, unknown>) {
    const { error } = await createAdminClient().from("generated_estimate_documents").update(values).eq("id", documentId);
    if (error) throw new ProposalRepositoryError();
  }
}

function mapDocument(row: DocumentRow): GeneratedEstimateDocument {
  return { id: row.id, companyId: row.company_id, estimateId: row.estimate_id, estimateRevision: row.estimate_revision, versionId: row.version_id ?? null, templateId: row.template_id, generationFingerprint: row.generation_fingerprint, status: row.status, storageBucket: row.storage_bucket, storageKey: row.storage_key, pageCount: row.page_count, fileSizeBytes: row.file_size_bytes, checksumSha256: row.checksum_sha256, safeError: row.safe_error, createdAt: row.created_at };
}
