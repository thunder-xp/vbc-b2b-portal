import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicPartnerDirectory } from "../components/PublicPartnerDirectory";
import type { PublicPartnerDirectoryRepository } from "../repositories/public-partner-directory.repository";
import { PublicPartnerDirectoryService } from "../services/public-partner-directory.service";
import { parsePublicPartnerDirectoryRecords } from "../validation";

const logoPath = "10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000002.webp";
const previousSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

afterEach(() => {
  vi.restoreAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = previousSupabaseUrl;
});

describe("public partner directory", () => {
  it("uses one bounded repository call and maps only approved public fields", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    const listPublished = vi.fn().mockResolvedValue([
      { displayName: "Approved Partner", logoAssetPath: logoPath },
      { displayName: "Partner Without Logo", logoAssetPath: null },
    ]);
    const service = new PublicPartnerDirectoryService({ listPublished } satisfies PublicPartnerDirectoryRepository);

    await expect(service.listPartners()).resolves.toEqual([
      {
        displayName: "Approved Partner",
        logoUrl: `https://project.supabase.co/storage/v1/render/image/public/company-logos/${logoPath}?width=320&height=180&resize=contain&quality=75`,
      },
      { displayName: "Partner Without Logo", logoUrl: null },
    ]);
    expect(listPublished).toHaveBeenCalledOnce();
  });

  it("strictly rejects private or internal company fields", () => {
    for (const field of ["companyId", "external_1c_id", "debt", "contract", "partnerPrice", "status"]) {
      expect(() => parsePublicPartnerDirectoryRecords([
        { displayName: "Partner", logoAssetPath: null, [field]: "private" },
      ])).toThrow();
    }
  });

  it("renders equal responsive cards and a bounded missing-logo fallback", () => {
    render(<PublicPartnerDirectory locale="ru" partners={[
      { displayName: "Partner One", logoUrl: null },
      { displayName: "Partner Two", logoUrl: "https://project.supabase.co/storage/v1/render/image/public/company-logos/approved.webp" },
    ]} />);

    expect(screen.getByRole("heading", { name: "Наши партнёры" })).toBeInTheDocument();
    expect(screen.getByRole("list")).toHaveClass("grid-cols-1", "sm:grid-cols-2", "lg:grid-cols-3", "xl:grid-cols-4");
    expect(screen.getAllByRole("article")[0]).toHaveClass("grid-rows-[112px_auto]", "overflow-hidden");
    expect(screen.getByRole("img", { name: "Partner Two" })).toHaveClass("object-contain");
  });

  it("localizes Romanian copy and keeps the empty state safe", () => {
    render(<PublicPartnerDirectory locale="ro" partners={[]} />);
    expect(screen.getByRole("heading", { name: "Partenerii noștri" })).toBeInTheDocument();
    expect(screen.getByText("Lista partenerilor este în curs de pregătire pentru publicare.")).toBeInTheDocument();
  });
});
