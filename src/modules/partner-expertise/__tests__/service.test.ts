import { describe, expect, it, vi } from "vitest";
import type { PartnerExpertiseRepository } from "../repository";
import { PartnerExpertiseService } from "../service";

function repository(): PartnerExpertiseRepository {
  return { listPartner: vi.fn(), findPartner: vi.fn(), listAdmin: vi.fn(), findAdmin: vi.fn(), save: vi.fn(async () => "video-1"), transition: vi.fn() };
}

describe("PartnerExpertiseService", () => {
  it("normalizes provider identity server-side before persistence", async () => {
    const repo = repository();
    const service = new PartnerExpertiseService(repo);
    await service.save({ id: null, section: "LAB", youtubeUrl: "https://youtu.be/dQw4w9WgXcQ", titleRu: "Название", titleRo: "Titlu", descriptionRu: "Описание", descriptionRo: "Descriere", sortOrder: 10, expectedRevision: null });
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ youtubeVideoId: "dQw4w9WgXcQ", canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }));
  });
  it("does not call persistence for an unsafe URL", async () => {
    const repo = repository();
    const service = new PartnerExpertiseService(repo);
    await expect(service.save({ id: null, section: "LAB", youtubeUrl: "https://example.test/video", titleRu: "Название", titleRo: "Titlu", descriptionRu: "Описание", descriptionRo: "Descriere", sortOrder: 10, expectedRevision: null })).rejects.toThrow("INVALID_YOUTUBE_URL");
    expect(repo.save).not.toHaveBeenCalled();
  });
});
