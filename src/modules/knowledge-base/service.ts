import type { KnowledgeRepository } from "./repository";
import type { KnowledgeBlock } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class KnowledgeService {
  constructor(private readonly repository: KnowledgeRepository) {}
  landing(companyId: string, locale = "ru") {
    return this.repository.landing(companyId, locale === "ro" ? "ro" : "ru");
  }
  article(companyId: string, slug: string) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return Promise.resolve(null);
    return this.repository.article(companyId, slug);
  }
  search(companyId: string, value: string, source = "landing", limit = 10) {
    const query = value.trim().replace(/\s+/g, " ").slice(0, 100);
    return query.length < 2
      ? Promise.resolve([])
      : this.repository.search(companyId, query, source, Math.min(limit, 20));
  }
  productArticles(companyId: string, productId: string) {
    return UUID.test(productId)
      ? this.repository.productArticles(companyId, productId)
      : Promise.resolve([]);
  }
  recordView(companyId: string, articleId: string, completed = false) {
    return this.repository.recordView(companyId, articleId, completed);
  }
  feedback(
    companyId: string,
    articleId: string,
    helpful: boolean,
    reason: string | null,
  ) {
    return this.repository.feedback(
      companyId,
      articleId,
      helpful,
      helpful ? null : reason,
    );
  }
  suggestionOutcome(
    companyId: string,
    articleId: string,
    queryHash: string,
    source: "support" | "service",
    outcome: string,
  ) {
    return this.repository.suggestionOutcome(
      companyId,
      articleId,
      queryHash,
      source,
      outcome,
    );
  }
  adminList(status: string | null, query: string, page = 1) {
    return this.repository.adminList(
      status,
      query.trim().slice(0, 100),
      30,
      (Math.max(page, 1) - 1) * 30,
    );
  }
  adminGet(articleId: string) {
    return this.repository.adminGet(articleId);
  }
  editorOptions() {
    return this.repository.editorOptions();
  }
  adminSave(form: FormData) {
    const articleId = String(form.get("articleId") || "") || null;
    const content = parseBlocks(String(form.get("content") || ""));
    const categories = form.getAll("categoryIds").map(String).filter(UUID.test);
    const products = form.getAll("productIds").map(String).filter(UUID.test);
    const documents = form.getAll("documentIds").map(String).filter(UUID.test);
    return this.repository.adminSave({
      p_article_id: articleId,
      p_slug: String(form.get("slug") || ""),
      p_title: String(form.get("title") || ""),
      p_summary: String(form.get("summary") || ""),
      p_article_type: String(form.get("articleType") || "article"),
      p_visibility: String(form.get("visibility") || "internal_only"),
      p_locale: "ru",
      p_content: content,
      p_featured: form.get("featured") === "on",
      p_category_ids: categories,
      p_product_ids: products,
      p_document_ids: documents,
      p_expected_version: articleId ? Number(form.get("version")) : null,
    });
  }
  adminTransition(
    articleId: string,
    action: string,
    version: number,
    reason: string | null,
  ) {
    return this.repository.adminTransition(articleId, action, version, reason);
  }
  diagnostics() {
    return this.repository.diagnostics();
  }
}
export function parseBlocks(value: string): KnowledgeBlock[] {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed) || parsed.length > 100)
    throw new Error("Invalid article content.");
  return parsed as KnowledgeBlock[];
}
