"use client";

import { useActionState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { blogActionInitial, saveAdminBlogArticleAction, transitionAdminBlogArticleAction, updateAdminBlogHeroAction } from "./actions";
import { blogBlocksToEditorText } from "./service";
import type { AdminBlogArticle, PublicBlogLocale } from "./types";

export function AdminBlogEditor({ article, locale }: { article: AdminBlogArticle | null; locale: PublicBlogLocale }) {
  const router = useRouter();
  const [saveState, saveAction, savePending] = useActionState(saveAdminBlogArticleAction, blogActionInitial);
  const [heroState, heroAction, heroPending] = useActionState(updateAdminBlogHeroAction, blogActionInitial);
  const [transitionState, transitionAction, transitionPending] = useActionState(transitionAdminBlogArticleAction, blogActionInitial);
  useEffect(() => { if (!article && saveState.status === "success" && saveState.articleId) router.replace(`/admin/content/blog/${saveState.articleId}?locale=${locale}`); }, [article, locale, router, saveState]);
  const localeRevision = article?.localizationRevision ?? 0;
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
    <form action={saveAction} className="space-y-5 border border-zinc-200 bg-white p-5">
      <input name="articleId" type="hidden" value={article?.id ?? ""} /><input name="articleRevision" type="hidden" value={article?.articleRevision ?? 0} /><input name="localizationRevision" type="hidden" value={localeRevision} /><input name="locale" type="hidden" value={locale} />
      <div className="grid gap-4 md:grid-cols-2"><Field label="Slug"><input className={inputClass} defaultValue={article?.slug ?? ""} name="slug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required /></Field><Field label="Категория"><input className={inputClass} defaultValue={article?.categorySlug ?? "guides"} name="categorySlug" pattern="[a-z0-9]+(-[a-z0-9]+)*" required /></Field></div>
      <Field label={`Заголовок ${locale.toUpperCase()}`}><input className={inputClass} defaultValue={article?.title ?? ""} maxLength={180} name="title" required /></Field>
      <Field label="Краткое описание"><textarea className={`${inputClass} min-h-24 py-3`} defaultValue={article?.excerpt ?? ""} maxLength={500} name="excerpt" required /></Field>
      <Field hint="Используйте ## для H2, ### для H3, - для списка и 1. для нумерованного списка. HTML не поддерживается." label="Структурированный текст"><textarea className={`${inputClass} min-h-[420px] py-3 font-mono text-xs leading-6`} defaultValue={article ? blogBlocksToEditorText(article.content) : "## Первый раздел\n\nТекст материала."} name="content" required /></Field>
      <div className="grid gap-4 md:grid-cols-2"><Field label="SEO title"><input className={inputClass} defaultValue={article?.metaTitle ?? ""} maxLength={180} name="metaTitle" /></Field><Field label="Alt обложки"><input className={inputClass} defaultValue={article?.heroAlt ?? ""} maxLength={240} name="heroAlt" /></Field></div>
      <Field label="SEO description"><textarea className={`${inputClass} min-h-20 py-3`} defaultValue={article?.metaDescription ?? ""} maxLength={320} name="metaDescription" /></Field>
      <fieldset className="space-y-4 border-t border-zinc-200 pt-5"><legend className="text-sm font-semibold">Контекстные связи</legend><p className="text-xs text-zinc-500">Только точные SKU и slug. Не используйте названия для сопоставления.</p><div className="grid gap-4 md:grid-cols-2"><Field label="SKU товаров"><textarea className={`${inputClass} min-h-20 py-3`} defaultValue={article?.productSkus.join(", ") ?? ""} name="productSkus" /></Field><Field label="Slug категорий"><textarea className={`${inputClass} min-h-20 py-3`} defaultValue={article?.categorySlugs.join(", ") ?? ""} name="categorySlugs" /></Field><Field label="Сервисы"><select className={`${inputClass} min-h-28 py-2`} defaultValue={article?.serviceKeys ?? []} multiple name="serviceKeys"><option value="cctv_calculator">CCTV calculator</option><option value="installation">Installation</option><option value="catalog">Catalog</option></select></Field><Field label="Slug связанных статей"><textarea className={`${inputClass} min-h-20 py-3`} defaultValue={article?.relatedSlugs.join(", ") ?? ""} name="relatedSlugs" /></Field></div></fieldset>
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input defaultChecked={article?.featured ?? false} name="featured" type="checkbox" />Показывать как рекомендуемый материал</label>
      <ActionMessage state={saveState} /><button className="min-h-11 bg-zinc-950 px-5 text-sm font-semibold text-white disabled:opacity-60" disabled={savePending} type="submit">{savePending ? "Сохранение…" : "Сохранить"}</button>
    </form>
    <aside className="space-y-5 xl:sticky xl:top-20 xl:self-start">
      <section className="border border-zinc-200 bg-white p-4"><p className="text-xs uppercase text-zinc-500">Локализация</p><div className="mt-3 grid grid-cols-2 gap-2">{(["ru", "ro"] as const).map((item) => <Link aria-current={item === locale ? "page" : undefined} className={`grid min-h-11 place-items-center border text-sm font-semibold ${item === locale ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-zinc-300"}`} href={article ? `/admin/content/blog/${article.id}?locale=${item}` : `/admin/content/blog/new?locale=${item}`} key={item}>{item.toUpperCase()}</Link>)}</div></section>
      {article ? <>
        <section className="border border-zinc-200 bg-white p-4"><p className="text-xs uppercase text-zinc-500">Статус</p><p className="mt-2 font-semibold">{article.status}</p><Link className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-800" href={`/admin/content/blog/${article.id}/preview?locale=${locale}`}>Предпросмотр</Link><form action={transitionAction} className="mt-3 grid gap-2"><HiddenTransition article={article} /><input className={inputClass} name="reason" placeholder="Причина (необязательно)" />{transitionActions(article.status).map((item) => <button className="min-h-11 border border-zinc-300 px-3 text-sm font-semibold disabled:opacity-60" disabled={transitionPending} key={item.action} name="action" type="submit" value={item.action}>{item.label}</button>)}<ActionMessage state={transitionState} /></form></section>
        <section className="border border-zinc-200 bg-white p-4"><p className="text-xs uppercase text-zinc-500">Обложка</p>{article.heroPublicUrl ? <p className="mt-2 break-all text-xs text-zinc-500">Публичная проекция готова</p> : null}<form action={heroAction} className="mt-3 grid gap-3"><input name="articleId" type="hidden" value={article.id} /><input name="locale" type="hidden" value={locale} /><input name="localizationRevision" type="hidden" value={localeRevision} /><input accept="image/jpeg,image/png,image/webp" className="block w-full text-xs" name="hero" type="file" /><button className="min-h-11 border border-zinc-300 px-3 text-sm font-semibold disabled:opacity-60" disabled={heroPending} type="submit">Загрузить / заменить</button>{article.heroSourceStorageKey ? <button className="min-h-11 border border-red-300 px-3 text-sm font-semibold text-red-700" disabled={heroPending} name="intent" type="submit" value="remove">Удалить из черновика</button> : null}<ActionMessage state={heroState} /></form></section>
      </> : <p className="border border-zinc-200 bg-white p-4 text-sm text-zinc-600">Сначала сохраните черновик, затем добавьте обложку и отправьте материал на проверку.</p>}
    </aside>
  </div>;
}

function HiddenTransition({ article }: { article: AdminBlogArticle }) { return <><input name="articleId" type="hidden" value={article.id} /><input name="locale" type="hidden" value={article.locale} /><input name="localizationRevision" type="hidden" value={article.localizationRevision} /></>; }
function transitionActions(status: AdminBlogArticle["status"]) { if (status === "draft") return [{ action: "submit_review", label: "Передать на проверку" }]; if (status === "review") return [{ action: "publish", label: "Опубликовать" }]; if (status === "published") return [{ action: "archive", label: "Архивировать" }]; return [{ action: "restore", label: "Вернуть в черновик" }]; }
function Field({ children, hint, label }: { children: React.ReactNode; hint?: string; label: string }) { return <label className="grid gap-2 text-sm font-medium">{label}{hint ? <span className="text-xs font-normal text-zinc-500">{hint}</span> : null}{children}</label>; }
function ActionMessage({ state }: { state: { status: string; message: string } }) { return state.message ? <p aria-live="polite" className={`text-xs ${state.status === "success" ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p> : null; }
const inputClass = "min-h-11 w-full border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-100";
