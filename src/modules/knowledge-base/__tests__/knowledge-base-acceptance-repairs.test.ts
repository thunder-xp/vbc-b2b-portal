import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260804213000_knowledge_base_acceptance_repairs.sql",
  ),
  "utf8",
);
const conflictSql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260804220000_knowledge_base_conflict_repair.sql",
  ),
  "utf8",
);
const naturalSearchSql = fs.readFileSync(
  path.join(
    process.cwd(),
    "supabase/migrations/20260804223000_knowledge_natural_language_search.sql",
  ),
  "utf8",
);

describe("knowledge base acceptance repairs", () => {
  it("ranks title phrase matches ahead of body-only matches", () => {
    expect(sql).toContain("when lower(a.title) like '%' || q || '%' then 2");
    expect(sql).toContain("when lower(a.summary) like '%' || q || '%' then 3");
    expect(sql).toContain("order by rank, a.updated_at desc, a.id");
  });

  it("uses an unambiguous version variable for idempotent feedback", () => {
    expect(sql).toContain("v_article_version integer");
    expect(sql).toContain("select a.version into v_article_version");
    expect(sql).toContain("on conflict (article_id, article_version, user_id)");
    expect(sql).not.toMatch(/declare\s+article_version\s+integer/);
  });

  it("applies the same version fix to suggestion outcomes", () => {
    expect(sql).toContain("public.record_knowledge_suggestion_outcome");
    expect(sql).toContain("knowledge_ticket_suggestions.resolved_at");
    expect(sql).toContain("p_query_hash !~ '^[0-9a-f]{64}$'");
  });

  it("preserves bounded search, privacy, and grants", () => {
    expect(sql).toContain("least(greatest(coalesce(p_limit, 10), 1), 20)");
    expect(sql).toContain("extensions.digest(q, 'sha256')");
    expect(sql).not.toContain("query_text");
    expect(sql).toContain("from public, anon");
    expect(sql).toContain("to authenticated");
  });

  it("returns a non-retryable domain conflict for stale edits", () => {
    expect(conflictSql).toContain("KNOWLEDGE_VERSION_CONFLICT");
    expect(conflictSql).toContain("using errcode = 'P0001'");
    expect(conflictSql).not.toContain("errcode = '40001'");
  });

  it("matches bounded natural-language token overlap without storing raw text", () => {
    expect(naturalSearchSql).toContain("with query_tokens as");
    expect(naturalSearchSql).toContain("token_match.hits >= least(2, token_match.total)");
    expect(naturalSearchSql).toContain("limit 20");
    expect(naturalSearchSql).toContain("extensions.digest(q, 'sha256')");
    expect(naturalSearchSql).not.toContain("query_text");
  });
});
