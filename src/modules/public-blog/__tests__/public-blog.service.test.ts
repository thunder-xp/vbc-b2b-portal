import { describe, expect, it, vi } from "vitest";

import { AdminBlogService, PublicBlogService, blogBlocksToEditorText, parseBlogEditorText } from "../service";

describe("Public Blog service", () => {
  it("parses only the governed structured authoring format", () => {
    const blocks = parseBlogEditorText("## Выбор камеры\n\nТекст <script>без HTML</script>.\n\n- Первый пункт\n- Второй пункт\n\n### Монтаж\n\n1. Проверить трассу\n2. Установить камеру");
    expect(blocks).toEqual([
      { type: "heading2", text: "Выбор камеры" },
      { type: "paragraph", text: "Текст scriptбез HTML/script." },
      { type: "unordered_list", items: ["Первый пункт", "Второй пункт"] },
      { type: "heading3", text: "Монтаж" },
      { type: "ordered_list", items: ["Проверить трассу", "Установить камеру"] },
    ]);
    expect(parseBlogEditorText(blogBlocksToEditorText(blocks))).toEqual(blocks);
  });

  it("bounds public pagination and rejects malformed slugs before the repository", async () => {
    const repository = { landing: vi.fn().mockResolvedValue({ items: [], total: 0, categories: [] }), article: vi.fn(), forProduct: vi.fn(), forCategory: vi.fn(), sitemap: vi.fn() };
    const service = new PublicBlogService(repository);
    await service.landing("ru", "video-surveillance", 999, 999);
    expect(repository.landing).toHaveBeenCalledWith("ru", "video-surveillance", 24, 2400);
    await expect(service.article("../private", "ru")).resolves.toBeNull();
    expect(repository.article).not.toHaveBeenCalled();
  });

  it("passes exact SKU/slug relations and every selected service through one save", async () => {
    const repository = { list: vi.fn(), get: vi.fn(), save: vi.fn().mockResolvedValue("article-id"), setHero: vi.fn(), transition: vi.fn() };
    const form = new FormData();
    form.set("locale", "ru"); form.set("slug", "camera-guide"); form.set("categorySlug", "video-surveillance"); form.set("title", "Как выбрать камеру"); form.set("excerpt", "Практическое описание выбора камеры для системы."); form.set("content", "## Камеры\n\nПрактический текст.");
    form.set("productSkus", "1001, 1002"); form.set("categorySlugs", "video-surveillance"); form.append("serviceKeys", "cctv_calculator"); form.append("serviceKeys", "installation");
    await new AdminBlogService(repository).save(form);
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ p_product_skus: ["1001", "1002"], p_category_slugs: ["video-surveillance"], p_service_keys: ["cctv_calculator", "installation"] }));
  });
});
