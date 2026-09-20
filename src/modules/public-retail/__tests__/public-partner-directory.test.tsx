import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicPartnerDirectory } from "../components/PublicPartnerDirectory";
import type { PublicPartnerDirectoryRepository } from "../repositories/public-partner-directory.repository";
import { PublicPartnerDirectoryService } from "../services/public-partner-directory.service";
import { parsePublicPartnerDetailRecord, parsePublicPartnerDirectoryResult } from "../validation";

const logoPath = "10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000002.webp";
const previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const record = {
  slug: "approved-partner",
  displayName: "Approved Partner",
  logoAssetPath: logoPath,
  locality: "Chișinău",
  capabilities: [{ code: "CCTV" as const, evidenceStatus: "VERIFIED" as const }],
  updatedAt: "2026-09-20T10:00:00Z",
};

afterEach(() => {
  vi.restoreAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl;
});

describe("public partner community", () => {
  it("uses one bounded repository call and maps only approved public fields", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    const repository: PublicPartnerDirectoryRepository = {
      listPublished: vi.fn().mockResolvedValue({ items: [record], localities: ["Chișinău"], capabilities: ["CCTV"] }),
      getPublishedBySlug: vi.fn(),
    };
    const service = new PublicPartnerDirectoryService(repository);
    const result = await service.listPartners({ search: " Approved ", locality: "Chișinău", capability: "CCTV" });

    expect(result.items[0]).toEqual({
      slug: "approved-partner",
      displayName: "Approved Partner",
      logoUrl: `https://project.supabase.co/storage/v1/render/image/public/company-logos/${logoPath}?width=320&height=180&resize=contain&quality=75`,
      locality: "Chișinău",
      capabilities: [{ code: "CCTV", evidenceStatus: "VERIFIED" }],
      updatedAt: "2026-09-20T10:00:00Z",
    });
    expect(repository.listPublished).toHaveBeenCalledOnce();
    expect(repository.listPublished).toHaveBeenCalledWith({ search: "Approved", locality: "Chișinău", capability: "CCTV" });
  });

  it("loads one published detail by safe slug and rejects malformed slugs before data access", async () => {
    const repository: PublicPartnerDirectoryRepository = {
      listPublished: vi.fn(),
      getPublishedBySlug: vi.fn().mockResolvedValue({ ...record, descriptionRu: "Описание", descriptionRo: "Descriere", publicEmail: null, publicPhone: null, publicWebsite: "https://partner.md" }),
    };
    const service = new PublicPartnerDirectoryService(repository);
    await expect(service.getPartnerBySlug("approved-partner")).resolves.toMatchObject({ slug: "approved-partner", publicWebsite: "https://partner.md" });
    await expect(service.getPartnerBySlug("../private-id")).resolves.toBeNull();
    expect(repository.getPublishedBySlug).toHaveBeenCalledTimes(1);
  });

  it("strictly rejects private and Marketplace fields", () => {
    const safe = { items: [record], localities: ["Chișinău"], capabilities: ["CCTV"] };
    for (const field of ["companyId", "external_1c_id", "debt", "contract", "providerId", "rankingScore", "verifiedReviewCount", "availability"]) {
      expect(() => parsePublicPartnerDirectoryResult({ ...safe, items: [{ ...record, [field]: "private" }] })).toThrow();
    }
    expect(() => parsePublicPartnerDetailRecord({ ...record, descriptionRu: null, descriptionRo: null, publicEmail: null, publicPhone: null, publicWebsite: null, privatePhone: "+37300000000" })).toThrow();
  });

  it("renders compact cards, URL-backed filters and precise verified-capability copy", () => {
    render(<PublicPartnerDirectory directory={{
      items: [{ slug: "partner-one", displayName: "Partner One", logoUrl: null, locality: "Chișinău", capabilities: [{ code: "CCTV", evidenceStatus: "VERIFIED" }], updatedAt: null }],
      localities: ["Chișinău"],
      capabilityCodes: ["CCTV"],
    }} filters={{ search: "", locality: "", capability: null }} locale="ru" />);

    expect(screen.getByRole("search")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Открыть профиль/ })).toHaveAttribute("href", "/partners/partner-one?lang=ru");
    expect(screen.getByLabelText("Компетенция подтверждена Novotech")).toBeInTheDocument();
    expect(screen.queryByText(/Проверенный партнёр|отзыв|рейтинг|доступен/i)).not.toBeInTheDocument();
  });

  it("localizes Romanian copy and keeps filtered empty state safe", () => {
    render(<PublicPartnerDirectory directory={{ items: [], localities: [], capabilityCodes: [] }} filters={{ search: "nimic", locality: "", capability: null }} locale="ro" />);
    expect(screen.getByRole("heading", { name: "Comunitatea partenerilor" })).toBeInTheDocument();
    expect(screen.getByText("Nu au fost găsiți parteneri")).toBeInTheDocument();
  });
});
