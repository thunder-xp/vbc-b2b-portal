import "server-only";

import { z } from "zod";

import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "@/src/modules/access-control/repositories";

import type { AdminPublicPartnerDirectoryRepository } from "../admin-public-partner-directory.repository";

const uuid = z.string().uuid();
const rawRecord = z.object({
  companyId: uuid,
  companyName: z.string().trim().min(1).max(240),
  publicDisplayName: z.string().trim().min(2).max(160).nullable(),
  logoAssetPath: z.string().max(100).nullable(),
  approvedLogoAssetPath: z.string().max(100).nullable(),
  visible: z.boolean(),
  revision: z.number().int().positive(),
  updatedAt: z.string().datetime({ offset: true }).nullable(),
  publishedAt: z.string().datetime({ offset: true }).nullable(),
}).strict();
const rawPage = z.object({
  records: z.array(rawRecord).max(50),
  totalCount: z.number().int().nonnegative(),
  publishedCount: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(50),
}).strict();
const updateResult = z.object({
  companyId: uuid,
  revision: z.number().int().positive(),
  visible: z.boolean(),
  changed: z.boolean(),
  correlationId: uuid,
}).strict();
const updateLogoResult = z.object({
  companyId: uuid,
  previousLogoAssetPath: z.string().max(100).nullable(),
  logoAssetPath: z.string().max(100).nullable(),
  revision: z.number().int().positive(),
  visible: z.boolean(),
  changed: z.boolean(),
  auditEventId: uuid.nullable(),
  correlationId: uuid,
}).strict();

export class SupabaseAdminPublicPartnerDirectoryRepository implements AdminPublicPartnerDirectoryRepository {
  async list(input: Parameters<AdminPublicPartnerDirectoryRepository["list"]>[0]) {
    const supabase = await createClient();
    const payload = {
      p_page: input.page,
      p_page_size: input.pageSize,
      p_search: input.search || null,
      p_filter: input.filter,
    };
    const { data, error } = await supabase.rpc("list_admin_public_partner_directory", payload);
    if (error || data === null) throw unexpected("list_admin_public_partner_directory", payload, error);
    const parsed = rawPage.parse(data);
    return {
      ...parsed,
      records: parsed.records.map((record) => ({
        companyId: record.companyId,
        companyName: record.companyName,
        publicDisplayName: record.publicDisplayName,
        currentLogoUrl: companyLogoUrl(record.logoAssetPath),
        approvedLogoUrl: companyLogoUrl(record.approvedLogoAssetPath),
        visible: record.visible,
        revision: record.revision,
        updatedAt: record.updatedAt,
        publishedAt: record.publishedAt,
      })),
    };
  }

  async update(input: Parameters<AdminPublicPartnerDirectoryRepository["update"]>[0]) {
    const supabase = await createClient();
    const payload = {
      p_company_id: input.companyId,
      p_expected_revision: input.expectedRevision,
      p_public_display_name: input.publicDisplayName,
      p_visible: input.visible,
      p_use_current_logo: input.useCurrentLogo,
      p_correlation_id: input.correlationId,
    };
    const { data, error } = await supabase.rpc("update_admin_public_partner_directory", payload);
    if (error?.code === "PT409") throw new Error("PUBLIC_PARTNER_DIRECTORY_CONFLICT");
    const domainCode = [
      "PUBLIC_PARTNER_NAME_INVALID",
      "PUBLIC_PARTNER_NAME_REQUIRED",
      "PUBLIC_PARTNER_COMPANY_NOT_FOUND",
      "PUBLIC_PARTNER_COMPANY_INACTIVE",
    ].find((code) => error?.message.includes(code));
    if (domainCode) throw new Error(domainCode);
    if (error || data === null) throw unexpected("update_admin_public_partner_directory", payload, error);
    return updateResult.parse(data);
  }

  async updateLogo(input: Parameters<AdminPublicPartnerDirectoryRepository["updateLogo"]>[0]) {
    const supabase = await createClient();
    const payload = {
      p_company_id: input.companyId,
      p_expected_revision: input.expectedRevision,
      p_logo_asset_path: input.logoAssetPath,
      p_correlation_id: input.correlationId,
    };
    const { data, error } = await supabase.rpc("update_admin_partner_company_logo", payload);
    if (error?.code === "PT409") throw new Error("ADMIN_COMPANY_LOGO_CONFLICT");
    const domainCode = [
      "ADMIN_COMPANY_LOGO_INPUT_INVALID",
      "ADMIN_COMPANY_LOGO_PATH_INVALID",
      "ADMIN_COMPANY_LOGO_COMPANY_NOT_FOUND",
      "ADMIN_COMPANY_LOGO_COMPANY_INACTIVE",
    ].find((code) => error?.message.includes(code));
    if (domainCode) throw new Error(domainCode);
    if (error || data === null) throw unexpected("update_admin_partner_company_logo", payload, error);
    return updateLogoResult.parse(data);
  }
}

function companyLogoUrl(assetPath: string | null): string | null {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!assetPath || !baseUrl) return null;
  const encodedPath = assetPath.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/render/image/public/company-logos/${encodedPath}?width=320&height=180&resize=contain&quality=75`;
}

function unexpected(operation: string, payload: Record<string, unknown>, cause: unknown) {
  return new RepositoryUnexpectedError({
    operation,
    table: "partner_companies",
    payloadKeys: Object.keys(payload),
    cause,
  });
}
