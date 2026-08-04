"use client";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  HelpCircle,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  Video,
} from "lucide-react";
import Link from "next/link";
import {
  recordKnowledgeSuggestionAction,
  saveKnowledgeArticleAction,
  searchKnowledgeAction,
  submitKnowledgeFeedbackAction,
  transitionKnowledgeArticleAction,
} from "./actions";
import {
  KNOWLEDGE_TYPE_LABELS,
  type AdminKnowledgeArticle,
  type KnowledgeArticle,
  type KnowledgeBlock,
  type KnowledgeCard,
} from "./types";
import { KnowledgeCardView } from "./landing-components";

const initial = {
  success: true as const,
  errorCode: null,
  message: "",
  data: null,
};
const transitionInitial = {
  success: true as const,
  errorCode: null,
  message: "",
  data: {} as Record<string, unknown>,
};
export function KnowledgeArticleView({
  article,
}: {
  article: KnowledgeArticle;
}) {
  return (
    <article className="mx-auto max-w-4xl">
      <header className="border-b border-zinc-200 pb-6">
        <Link
          className="text-sm font-semibold text-emerald-700"
          href="/cabinet/knowledge"
        >
          ← База знаний
        </Link>
        <p className="mt-5 text-xs font-semibold uppercase text-emerald-700">
          {KNOWLEDGE_TYPE_LABELS[article.articleType]}
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-zinc-950">
          {article.title}
        </h1>
        <p className="mt-3 text-lg text-zinc-600">{article.summary}</p>
        <p className="mt-4 text-xs text-zinc-500">
          Обновлено {new Date(article.updatedAt).toLocaleDateString("ru-RU")}
        </p>
      </header>
      <div className="prose prose-zinc mt-8 max-w-none">
        {article.content.map((block, index) => (
          <KnowledgeBlockView block={block} key={`${block.type}-${index}`} />
        ))}
      </div>
      {article.products.length ? (
        <RelatedSection
          icon={<BookOpen className="size-5" />}
          title="Связанные товары"
        >
          {article.products.map((p) => (
            <Link
              className="block border border-zinc-200 p-4 hover:border-emerald-400"
              href={`/cabinet/catalog/${p.slug}`}
              key={p.id}
            >
              <strong>{p.name}</strong>
              <span className="mt-1 block text-xs text-zinc-500">
                SKU {p.sku}
              </span>
            </Link>
          ))}
        </RelatedSection>
      ) : null}
      {article.documents.length ? (
        <RelatedSection
          icon={<FileText className="size-5" />}
          title="Документы"
        >
          {article.documents.map((d) => (
            <Link
              className="flex min-h-11 items-center justify-between border border-zinc-200 px-4 py-3 hover:border-emerald-400"
              href={d.route}
              key={d.id}
            >
              {d.title}
              <ExternalLink className="size-4" />
            </Link>
          ))}
        </RelatedSection>
      ) : null}
      {article.videos.length ? (
        <RelatedSection icon={<Video className="size-5" />} title="Видео">
          {article.videos.map((v) => (
            <a
              className="flex min-h-11 items-center justify-between border border-zinc-200 px-4 py-3 hover:border-emerald-400"
              href={v.url}
              key={v.id}
              rel="noopener noreferrer"
              target="_blank"
            >
              {v.title}
              <ExternalLink className="size-4" />
            </a>
          ))}
        </RelatedSection>
      ) : null}
      {article.related.length ? (
        <RelatedSection
          icon={<BookOpen className="size-5" />}
          title="Читайте также"
        >
          {article.related.map((a) => (
            <KnowledgeCardView article={a} key={a.id} />
          ))}
        </RelatedSection>
      ) : null}
      <KnowledgeFeedback articleId={article.id} />
    </article>
  );
}
function KnowledgeBlockView({ block }: { block: KnowledgeBlock }) {
  switch (block.type) {
    case "heading":
      return <h2>{block.text}</h2>;
    case "paragraph":
      return <p>{block.text}</p>;
    case "ordered_list":
      return (
        <ol>
          {block.items?.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ol>
      );
    case "unordered_list":
      return (
        <ul>
          {block.items?.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="space-y-3">
          {block.items?.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ol>
      );
    case "warning":
      return (
        <aside className="not-prose my-6 flex gap-3 border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-950">
          <TriangleAlert className="mt-0.5 size-5 shrink-0" />
          {block.text}
        </aside>
      );
    case "callout":
      return (
        <aside className="not-prose my-6 border-l-4 border-emerald-600 bg-emerald-50 p-4 text-sm text-emerald-950">
          {block.text}
        </aside>
      );
    case "support_cta":
      return (
        <p className="not-prose my-6">
          <Link
            className="inline-flex min-h-11 items-center bg-zinc-900 px-4 text-sm font-semibold text-white"
            href={
              block.target === "service"
                ? "/cabinet/service/new"
                : "/cabinet/support/new"
            }
          >
            {block.text || "Обратиться за помощью"}
          </Link>
        </p>
      );
    default:
      return null;
  }
}
function RelatedSection({
  children,
  icon,
  title,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <section className="mt-10 border-t border-zinc-200 pt-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        {icon}
        {title}
      </h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">{children}</div>
    </section>
  );
}
function KnowledgeFeedback({ articleId }: { articleId: string }) {
  const [state, action, pending] = useActionState(
    submitKnowledgeFeedbackAction,
    initial,
  );
  const [negative, setNegative] = useState(false);
  return (
    <section className="mt-10 border-t border-zinc-200 pt-6">
      <h2 className="font-semibold">Материал был полезен?</h2>
      <form action={action} className="mt-3 space-y-3">
        <input name="articleId" type="hidden" value={articleId} />
        <div className="flex gap-2">
          <button
            className="inline-flex min-h-11 items-center gap-2 border border-zinc-300 px-4 text-sm font-semibold disabled:opacity-60"
            disabled={pending}
            name="helpful"
            type="submit"
            value="true"
          >
            <ThumbsUp className="size-4" />
            Да
          </button>
          <button
            className="inline-flex min-h-11 items-center gap-2 border border-zinc-300 px-4 text-sm font-semibold disabled:opacity-60"
            disabled={pending}
            name="helpful"
            onClick={() => setNegative(true)}
            type="button"
          >
            <ThumbsDown className="size-4" />
            Нет
          </button>
        </div>
        {negative ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              aria-label="Причина"
              className="min-h-11 border border-zinc-300 px-3 text-sm"
              defaultValue="not_solved"
              name="reason"
            >
              <option value="outdated">Информация устарела</option>
              <option value="unclear">Инструкция непонятна</option>
              <option value="not_solved">Не помогло решить проблему</option>
              <option value="missing_step">Отсутствует нужный шаг</option>
              <option value="other">Другое</option>
            </select>
            <button
              className="min-h-11 bg-zinc-900 px-4 text-sm font-semibold text-white"
              name="helpful"
              type="submit"
              value="false"
            >
              Отправить
            </button>
          </div>
        ) : null}
        {state.message ? (
          <p aria-live="polite" className="text-sm text-emerald-700">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  );
}

export function KnowledgeSuggestions({
  source,
  text,
}: {
  source: "support" | "service";
  text: string;
}) {
  const [result, setResult] = useState<{
    query: string;
    articles: KnowledgeCard[];
  }>({ query: "", articles: [] });
  const [dismissed, setDismissed] = useState(false);
  const normalized = useMemo(() => text.trim().replace(/\s+/g, " "), [text]);
  useEffect(() => {
    if (normalized.length < 20) return;
    const timer = setTimeout(async () => {
      const response = await searchKnowledgeAction(normalized, source);
      if (response.success)
        setResult({ query: normalized, articles: response.data.slice(0, 3) });
    }, 400);
    return () => clearTimeout(timer);
  }, [normalized, source]);
  const articles = result.query === normalized ? result.articles : [];
  if (dismissed || !articles.length) return null;
  return (
    <aside
      aria-live="polite"
      className="border border-emerald-200 bg-emerald-50 p-4"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <HelpCircle className="size-4" />
        Возможно, ответ уже есть
      </h2>
      <ul className="mt-3 space-y-2">
        {articles.map((a) => (
          <li className="bg-white p-3" key={a.id}>
            <Link
              className="font-semibold text-emerald-800"
              href={`/cabinet/knowledge/${a.slug}`}
              onClick={() =>
                void recordKnowledgeSuggestionAction(
                  a.id,
                  normalized,
                  source,
                  "opened",
                )
              }
              target="_blank"
            >
              {a.title}
            </Link>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className="min-h-11 border border-emerald-300 px-3 text-xs font-semibold"
                onClick={() => {
                  void recordKnowledgeSuggestionAction(
                    a.id,
                    normalized,
                    source,
                    "solved",
                  );
                  setDismissed(true);
                }}
                type="button"
              >
                <CheckCircle2 className="mr-1 inline size-4" />
                Проблема решена
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        className="mt-3 min-h-11 text-sm font-semibold text-zinc-700 underline"
        onClick={() => {
          articles.forEach(
            (a) =>
              void recordKnowledgeSuggestionAction(
                a.id,
                normalized,
                source,
                "continued",
              ),
          );
          setDismissed(true);
        }}
        type="button"
      >
        Продолжить создание заявки
      </button>
    </aside>
  );
}

export function AdminKnowledgeTransition({
  article,
}: {
  article: AdminKnowledgeArticle;
}) {
  const [state, action, pending] = useActionState(
    transitionKnowledgeArticleAction,
    transitionInitial,
  );
  const actions =
    article.status === "draft"
      ? [{ value: "submit_review", label: "На проверку" }]
      : article.status === "review"
        ? [{ value: "publish", label: "Опубликовать" }]
        : article.status === "published"
          ? [{ value: "archive", label: "Архивировать" }]
          : [{ value: "restore", label: "Восстановить черновик" }];
  return (
    <form action={action} className="flex flex-wrap gap-2">
      <input name="articleId" type="hidden" value={article.id} />
      <input name="version" type="hidden" value={article.version} />
      {actions.map((a) => (
        <button
          className="min-h-11 bg-zinc-900 px-4 text-sm font-semibold text-white disabled:opacity-60"
          disabled={pending}
          key={a.value}
          name="action"
          value={a.value}
        >
          {a.label}
        </button>
      ))}
      {state.message ? (
        <p aria-live="polite" className="w-full text-sm">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

type EditorOptions = {
  categories: Array<{ id: string; name: string }>;
  products: Array<{ id: string; sku: string; name: string }>;
  documents: Array<{ id: string; title: string; documentType: string }>;
};
export function AdminKnowledgeEditor({
  article,
  options,
}: {
  article?: Record<string, unknown> | null;
  options: EditorOptions;
}) {
  const [state, action, pending] = useActionState(
    saveKnowledgeArticleAction,
    initial,
  );
  const content = article?.content_json ?? [{ type: "paragraph", text: "" }];
  const categoryIds = Array.isArray(article?.categoryIds)
    ? (article.categoryIds as string[])
    : [];
  const productIds = Array.isArray(article?.productIds)
    ? (article.productIds as string[])
    : [];
  const documentIds = Array.isArray(article?.documentIds)
    ? (article.documentIds as string[])
    : [];
  return (
    <form action={action} className="space-y-5">
      <input name="articleId" type="hidden" value={String(article?.id ?? "")} />
      <input
        name="version"
        type="hidden"
        value={String(article?.version ?? "")}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <EditorField label="Заголовок">
          <input
            className={editorField}
            defaultValue={String(article?.title ?? "")}
            maxLength={240}
            name="title"
            required
          />
        </EditorField>
        <EditorField label="Slug">
          <input
            className={editorField}
            defaultValue={String(article?.slug ?? "")}
            name="slug"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
          />
        </EditorField>
      </div>
      <EditorField label="Краткое описание">
        <textarea
          className={`${editorField} min-h-24`}
          defaultValue={String(article?.summary ?? "")}
          maxLength={600}
          name="summary"
          required
        />
      </EditorField>
      <div className="grid gap-4 md:grid-cols-3">
        <EditorField label="Тип">
          <select
            className={editorField}
            defaultValue={String(article?.article_type ?? "article")}
            name="articleType"
          >
            {Object.entries(KNOWLEDGE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </EditorField>
        <EditorField label="Видимость">
          <select
            className={editorField}
            defaultValue={String(article?.visibility ?? "internal_only")}
            name="visibility"
          >
            <option value="internal_only">Только сотрудники</option>
            <option value="all_partners">Все партнёры</option>
          </select>
        </EditorField>
        <EditorField label="Категория">
          <select
            className={editorField}
            defaultValue={categoryIds[0] ?? ""}
            name="categoryIds"
            required
          >
            <option value="" disabled>
              Выберите
            </option>
            {options.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </EditorField>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <EditorField label="Связанные товары">
          <select
            className={`${editorField} min-h-36`}
            defaultValue={productIds}
            multiple
            name="productIds"
          >
            {options.products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.sku} · {product.name}
              </option>
            ))}
          </select>
        </EditorField>
        <EditorField label="Документы из центра документов">
          <select
            className={`${editorField} min-h-36`}
            defaultValue={documentIds}
            multiple
            name="documentIds"
          >
            {options.documents.map((document) => (
              <option key={document.id} value={document.id}>
                {document.title}
              </option>
            ))}
          </select>
        </EditorField>
      </div>
      <EditorField label="Структурированные блоки JSON">
        <textarea
          className={`${editorField} min-h-80 font-mono text-xs`}
          defaultValue={JSON.stringify(content, null, 2)}
          name="content"
          required
        />
        <span className="text-xs text-zinc-500">
          Разрешены только безопасные блоки. HTML не поддерживается.
        </span>
      </EditorField>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          defaultChecked={Boolean(article?.featured)}
          name="featured"
          type="checkbox"
        />
        Рекомендуемый материал
      </label>
      {state.message ? (
        <p aria-live="polite" className="text-sm text-rose-700">
          {state.message}
        </p>
      ) : null}
      <button
        className="min-h-11 bg-emerald-700 px-5 text-sm font-semibold text-white disabled:opacity-60"
        disabled={pending}
      >
        {pending ? "Сохранение..." : "Сохранить черновик"}
      </button>
    </form>
  );
}
const editorField =
  "min-h-11 w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
function EditorField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      {label}
      {children}
    </label>
  );
}
