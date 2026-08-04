import { describe, expect, it, vi } from "vitest";
import { KnowledgeService, parseBlocks } from "../service";
import type { KnowledgeRepository } from "../repository";
import { KnowledgeVersionConflictError } from "../types";

function repository(): KnowledgeRepository {
  return {
    landing: vi.fn(),
    article: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
    productArticles: vi.fn().mockResolvedValue([]),
    recordView: vi.fn(),
    feedback: vi.fn(),
    suggestionOutcome: vi.fn(),
    adminList: vi.fn(),
    adminGet: vi.fn(),
    editorOptions: vi.fn(),
    adminSave: vi.fn(),
    adminTransition: vi.fn(),
    diagnostics: vi.fn(),
  };
}
describe("KnowledgeService", () => {
  it("normalizes and bounds partner search", async () => {
    const repo = repository();
    await new KnowledgeService(repo).search(
      "company",
      "  цена   уточняется  ",
      "support",
      3,
    );
    expect(repo.search).toHaveBeenCalledWith(
      "company",
      "цена уточняется",
      "support",
      3,
    );
  });
  it("does not search short text", async () => {
    const repo = repository();
    await expect(
      new KnowledgeService(repo).search("company", "a"),
    ).resolves.toEqual([]);
    expect(repo.search).not.toHaveBeenCalled();
  });
  it("limits product articles to valid portal UUIDs", async () => {
    const repo = repository();
    const service = new KnowledgeService(repo);
    await service.productArticles("company", "bad");
    expect(repo.productArticles).not.toHaveBeenCalled();
  });
  it("accepts structured blocks and rejects non-arrays", () => {
    expect(parseBlocks('[{"type":"paragraph","text":"Safe"}]')).toHaveLength(1);
    expect(() => parseBlocks("{}")).toThrow("Invalid article content");
  });
  it("does not pass a reason for helpful feedback", async () => {
    const repo = repository();
    await new KnowledgeService(repo).feedback(
      "company",
      "article",
      true,
      "other",
    );
    expect(repo.feedback).toHaveBeenCalledWith(
      "company",
      "article",
      true,
      null,
    );
  });

  it("exposes a dedicated stale-version error", () => {
    expect(new KnowledgeVersionConflictError()).toMatchObject({
      name: "KnowledgeVersionConflictError",
    });
  });
});
