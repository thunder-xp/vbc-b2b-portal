import type {
  AdminKnowledgePage,
  KnowledgeArticle,
  KnowledgeCard,
  KnowledgeDiagnostics,
  KnowledgeLanding,
} from "./types";

export interface KnowledgeRepository {
  landing(companyId: string, locale: string): Promise<KnowledgeLanding | null>;
  article(companyId: string, slug: string): Promise<KnowledgeArticle | null>;
  search(
    companyId: string,
    query: string,
    source: string,
    limit?: number,
  ): Promise<KnowledgeCard[]>;
  productArticles(
    companyId: string,
    productId: string,
  ): Promise<KnowledgeCard[]>;
  recordView(
    companyId: string,
    articleId: string,
    completed?: boolean,
  ): Promise<void>;
  feedback(
    companyId: string,
    articleId: string,
    helpful: boolean,
    reason: string | null,
  ): Promise<void>;
  suggestionOutcome(
    companyId: string,
    articleId: string,
    queryHash: string,
    source: "support" | "service",
    outcome: string,
  ): Promise<void>;
  adminList(
    status: string | null,
    query: string,
    limit: number,
    offset: number,
  ): Promise<AdminKnowledgePage | null>;
  adminGet(articleId: string): Promise<Record<string, unknown> | null>;
  editorOptions(): Promise<{
    categories: Array<{ id: string; name: string }>;
    products: Array<{ id: string; sku: string; name: string }>;
    documents: Array<{ id: string; title: string; documentType: string }>;
  } | null>;
  adminSave(input: Record<string, unknown>): Promise<string>;
  adminTransition(
    articleId: string,
    action: string,
    version: number,
    reason: string | null,
  ): Promise<Record<string, unknown>>;
  diagnostics(): Promise<KnowledgeDiagnostics | null>;
}
