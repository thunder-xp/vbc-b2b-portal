export type KnowledgeArticleType =
  | "article"
  | "faq"
  | "installation_guide"
  | "configuration_guide"
  | "troubleshooting"
  | "warranty_instruction"
  | "service_instruction"
  | "video_guide"
  | "release_note"
  | "product_documentation";
export type KnowledgeStatus = "draft" | "review" | "published" | "archived";
export type KnowledgeBlock = {
  type: string;
  text?: string;
  items?: string[];
  target?: "support" | "service";
  url?: string;
  title?: string;
};
export type KnowledgeCard = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  articleType: KnowledgeArticleType;
  category?: string | null;
  updatedAt?: string;
};
export type KnowledgeCategory = {
  id: string;
  slug: string;
  name: string;
  articleCount: number;
};
export type KnowledgeLanding = {
  categories: KnowledgeCategory[];
  featured: KnowledgeCard[];
  recent: KnowledgeCard[];
};
export type KnowledgeArticle = KnowledgeCard & {
  locale: "ru" | "ro";
  content: KnowledgeBlock[];
  version: number;
  updatedAt: string;
  categories: Array<{ id: string; slug: string; name: string }>;
  products: Array<{
    id: string;
    sku: string;
    name: string;
    slug: string;
    imageUrl: string | null;
  }>;
  documents: Array<{
    id: string;
    title: string;
    documentType: string;
    route: string;
  }>;
  videos: Array<{
    id: string;
    provider: string;
    url: string;
    title: string;
    durationSeconds: number | null;
    thumbnailUrl: string | null;
  }>;
  related: KnowledgeCard[];
};
export type AdminKnowledgeArticle = KnowledgeCard & {
  status: KnowledgeStatus;
  visibility: "all_partners" | "internal_only";
  version: number;
  featured: boolean;
};
export type AdminKnowledgePage = {
  items: AdminKnowledgeArticle[];
  total: number;
};
export type KnowledgeDiagnostics = {
  totalArticles: number;
  drafts: number;
  inReview: number;
  published: number;
  archived: number;
  missingCategory: number;
  missingOwner: number;
  outdated: number;
  brokenProductLinks: number;
  brokenDocumentLinks: number;
  feedbackVolume: number;
  helpfulnessRatio: number | null;
  ticketAfterReadRatio: number | null;
  latestIndexBuild: string | null;
};

export const KNOWLEDGE_TYPE_LABELS: Record<KnowledgeArticleType, string> = {
  article: "Статья",
  faq: "Частый вопрос",
  installation_guide: "Инструкция по установке",
  configuration_guide: "Настройка",
  troubleshooting: "Устранение неполадок",
  warranty_instruction: "Гарантия",
  service_instruction: "Сервис",
  video_guide: "Видеоинструкция",
  release_note: "Обновление",
  product_documentation: "Материал о товаре",
};
