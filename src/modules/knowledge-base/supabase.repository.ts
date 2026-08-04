import { createClient } from "@/src/lib/supabase/server";
import { RepositoryUnexpectedError } from "../access-control/repositories";
import type { KnowledgeRepository } from "./repository";
import type {
  AdminKnowledgePage,
  KnowledgeArticle,
  KnowledgeCard,
  KnowledgeDiagnostics,
  KnowledgeLanding,
} from "./types";

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (await createClient()).rpc(name, args);
  if (error) throw new RepositoryUnexpectedError();
  return data as T;
}
export class SupabaseKnowledgeRepository implements KnowledgeRepository {
  landing(companyId: string, locale: string) {
    return rpc<KnowledgeLanding | null>("get_partner_knowledge_landing", {
      p_company_id: companyId,
      p_locale: locale,
    });
  }
  article(companyId: string, slug: string) {
    return rpc<KnowledgeArticle | null>("get_partner_knowledge_article", {
      p_company_id: companyId,
      p_slug: slug,
    });
  }
  async search(companyId: string, query: string, source: string, limit = 10) {
    const rows = await rpc<
      Array<{
        document_id: string;
        title: string;
        subtitle: string;
        route: string;
        updated_at: string;
      }>
    >("search_partner_knowledge", {
      p_company_id: companyId,
      p_query: query,
      p_limit: limit,
      p_source: source,
    });
    return rows.map(
      (row) =>
        ({
          id: row.document_id,
          slug: row.route.split("/").pop()!,
          title: row.title,
          summary: row.subtitle,
          articleType: "article",
          updatedAt: row.updated_at,
        }) as KnowledgeCard,
    );
  }
  productArticles(companyId: string, productId: string) {
    return rpc<KnowledgeCard[]>("list_product_knowledge", {
      p_company_id: companyId,
      p_product_id: productId,
      p_limit: 3,
    });
  }
  async recordView(companyId: string, articleId: string, completed = false) {
    await rpc("record_knowledge_article_view", {
      p_company_id: companyId,
      p_article_id: articleId,
      p_completed: completed,
    });
  }
  async feedback(
    companyId: string,
    articleId: string,
    helpful: boolean,
    reason: string | null,
  ) {
    await rpc("record_knowledge_feedback", {
      p_company_id: companyId,
      p_article_id: articleId,
      p_helpful: helpful,
      p_reason: reason,
    });
  }
  async suggestionOutcome(
    companyId: string,
    articleId: string,
    queryHash: string,
    source: "support" | "service",
    outcome: string,
  ) {
    await rpc("record_knowledge_suggestion_outcome", {
      p_company_id: companyId,
      p_article_id: articleId,
      p_query_hash: queryHash,
      p_source: source,
      p_outcome: outcome,
    });
  }
  adminList(
    status: string | null,
    query: string,
    limit: number,
    offset: number,
  ) {
    return rpc<AdminKnowledgePage | null>("list_admin_knowledge_articles", {
      p_status: status,
      p_query: query,
      p_limit: limit,
      p_offset: offset,
    });
  }
  adminGet(articleId: string) {
    return rpc<Record<string, unknown> | null>("get_admin_knowledge_article", {
      p_article_id: articleId,
    });
  }
  editorOptions() {
    return rpc<{
      categories: Array<{ id: string; name: string }>;
      products: Array<{ id: string; sku: string; name: string }>;
      documents: Array<{ id: string; title: string; documentType: string }>;
    } | null>("get_knowledge_editor_options", {});
  }
  adminSave(input: Record<string, unknown>) {
    return rpc<string>("save_knowledge_article", input);
  }
  adminTransition(
    articleId: string,
    action: string,
    version: number,
    reason: string | null,
  ) {
    return rpc<Record<string, unknown>>("transition_knowledge_article", {
      p_article_id: articleId,
      p_action: action,
      p_expected_version: version,
      p_reason: reason,
    });
  }
  diagnostics() {
    return rpc<KnowledgeDiagnostics | null>("get_knowledge_diagnostics", {});
  }
}
