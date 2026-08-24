import type { AdminBlogRepository, PublicBlogRepository } from "./repository";
import type { PublicBlogBlock, PublicBlogLocale } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SERVICE_KEYS = new Set(["cctv_calculator", "installation", "catalog"]);

export class PublicBlogService {
  constructor(private readonly repository: PublicBlogRepository) {}
  landing(locale: PublicBlogLocale, category: string | null, page = 1, limit = 12) {
    const normalizedCategory = category?.trim() || null;
    if (normalizedCategory && !SLUG.test(normalizedCategory)) return Promise.resolve({ items: [], total: 0, categories: [] });
    const boundedPage = Math.max(1, Math.min(101, Math.trunc(page)));
    const boundedLimit = Math.max(1, Math.min(24, Math.trunc(limit)));
    return this.repository.landing(locale, normalizedCategory, boundedLimit, (boundedPage - 1) * boundedLimit);
  }
  article(slug: string, locale: PublicBlogLocale) { return SLUG.test(slug) && slug.length <= 160 ? this.repository.article(slug, locale) : Promise.resolve(null); }
  forProduct(id: string, locale: PublicBlogLocale, limit = 3) { return UUID.test(id) ? this.repository.forProduct(id, locale, Math.min(6, Math.max(1, limit))) : Promise.resolve([]); }
  forCategory(id: string, locale: PublicBlogLocale, limit = 3) { return UUID.test(id) ? this.repository.forCategory(id, locale, Math.min(6, Math.max(1, limit))) : Promise.resolve([]); }
  sitemap() { return this.repository.sitemap(); }
}

export class AdminBlogService {
  constructor(private readonly repository: AdminBlogRepository) {}
  list(status: string | null, query: string, page = 1) {
    const validStatus = status && ["draft", "review", "published", "archived"].includes(status) ? status : null;
    const boundedPage = Math.max(1, Math.min(167, Math.trunc(page)));
    return this.repository.list(validStatus, query.trim().replace(/\s+/g, " ").slice(0, 100), 30, (boundedPage - 1) * 30);
  }
  get(articleId: string, locale: PublicBlogLocale) { return UUID.test(articleId) ? this.repository.get(articleId, locale) : Promise.resolve(null); }
  async save(form: FormData) {
    const articleId = value(form, "articleId") || null;
    const locale = localeValue(form);
    const blocks = parseBlogEditorText(value(form, "content"));
    if (articleId && !UUID.test(articleId)) throw new Error("BLOG_INPUT_INVALID");
    return this.repository.save({
      p_article_id: articleId, p_locale: locale, p_slug: slugValue(form, "slug"),
      p_category_slug: slugValue(form, "categorySlug"), p_featured: form.get("featured") === "on",
      p_title: value(form, "title"), p_excerpt: value(form, "excerpt"), p_content: blocks,
      p_meta_title: value(form, "metaTitle"), p_meta_description: value(form, "metaDescription"), p_hero_alt: value(form, "heroAlt"),
      p_product_skus: list(form, "productSkus", (item) => item.slice(0, 100)),
      p_category_slugs: list(form, "categorySlugs", ensureSlug),
      p_service_keys: list(form, "serviceKeys", (item) => { if (!SERVICE_KEYS.has(item)) throw new Error("BLOG_INPUT_INVALID"); return item; }),
      p_related_slugs: list(form, "relatedSlugs", ensureSlug),
      p_expected_article_revision: articleId ? integer(form, "articleRevision") : null,
      p_expected_localization_revision: articleId ? integer(form, "localizationRevision") : null,
    });
  }
  setHero(articleId: string, locale: PublicBlogLocale, revision: number, sourceStorageKey: string | null, width: number | null, height: number | null) {
    return this.repository.setHero({ p_article_id: articleId, p_locale: locale, p_expected_revision: revision, p_source_storage_key: sourceStorageKey, p_width: width, p_height: height });
  }
  transition(articleId: string, locale: PublicBlogLocale, action: string, revision: number, media: { key: string; url: string } | null, reason: string | null) {
    if (!UUID.test(articleId) || !["submit_review", "publish", "archive", "restore"].includes(action)) throw new Error("BLOG_INPUT_INVALID");
    return this.repository.transition({ p_article_id: articleId, p_locale: locale, p_action: action, p_expected_revision: revision, p_public_storage_key: media?.key ?? null, p_public_url: media?.url ?? null, p_reason: reason });
  }
}

export function parseBlogEditorText(input: string): PublicBlogBlock[] {
  const normalized = input.replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new Error("BLOG_CONTENT_REQUIRED");
  const blocks: PublicBlogBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listType: "ordered_list" | "unordered_list" | null = null;
  const flushParagraph = () => { if (paragraph.length) blocks.push({ type: "paragraph", text: clean(paragraph.join(" "), 4000) }); paragraph = []; };
  const flushList = () => { if (listType && listItems.length) blocks.push({ type: listType, items: listItems }); listType = null; listItems = []; };
  for (const rawLine of normalized.split("\n")) {
    const line = rawLine.trim();
    if (!line) { flushParagraph(); flushList(); continue; }
    if (line.startsWith("### ") || line.startsWith("## ")) {
      flushParagraph(); flushList();
      blocks.push({ type: line.startsWith("### ") ? "heading3" : "heading2", text: clean(line.replace(/^#{2,3}\s+/, ""), 240) });
      continue;
    }
    const unordered = /^[-*]\s+(.+)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const nextType = unordered ? "unordered_list" : "ordered_list";
      if (listType && listType !== nextType) flushList();
      listType = nextType; listItems.push(clean((unordered ?? ordered)![1], 500));
      continue;
    }
    flushList(); paragraph.push(line);
  }
  flushParagraph(); flushList();
  if (!blocks.length || blocks.length > 100) throw new Error("BLOG_INPUT_INVALID");
  return blocks;
}

export function blogBlocksToEditorText(blocks: PublicBlogBlock[]): string {
  return blocks.map((block) => {
    if (block.type === "heading2") return `## ${block.text}`;
    if (block.type === "heading3") return `### ${block.text}`;
    if (block.type === "paragraph") return block.text;
    return block.items.map((item, index) => block.type === "ordered_list" ? `${index + 1}. ${item}` : `- ${item}`).join("\n");
  }).join("\n\n");
}

function value(form: FormData, key: string) { return String(form.get(key) ?? "").trim(); }
function integer(form: FormData, key: string) { const result = Number(value(form, key)); if (!Number.isSafeInteger(result) || result < 0) throw new Error("BLOG_INPUT_INVALID"); return result; }
function localeValue(form: FormData): PublicBlogLocale { return value(form, "locale") === "ro" ? "ro" : "ru"; }
function slugValue(form: FormData, key: string) { return ensureSlug(value(form, key)); }
function ensureSlug(input: string) { if (!SLUG.test(input) || input.length > 160) throw new Error("BLOG_INPUT_INVALID"); return input; }
function list(form: FormData, key: string, transform: (item: string) => string) { return [...new Set(form.getAll(key).flatMap((entry) => String(entry).split(/[\s,]+/)).map((item) => item.trim()).filter(Boolean).map(transform))]; }
function clean(input: string, max: number) { const result = input.replace(/[<>]/g, "").replace(/\s+/g, " ").trim(); if (!result || result.length > max) throw new Error("BLOG_INPUT_INVALID"); return result; }
