import Image from "next/image";
import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/src/modules/admin/components";
import { requireAdminPagePermission } from "@/src/modules/admin/services";
import { createCommercialCampaignService } from "@/src/modules/commercial-campaigns/actions";
import { toCampaignDateTimeInput } from "@/src/modules/commercial-campaigns/campaign-datetime";
import { CampaignAdminActions, CampaignBuilder } from "@/src/modules/commercial-campaigns/components";
import { readableCampaignText } from "@/src/modules/commercial-campaigns/copy";
import { SPECIAL_OFFERS_PROMO_PROFILE } from "@/src/modules/commercial-campaigns/promo-profile";
import type { AdminCampaignDetail, CampaignBuilderOptions, CampaignDraftInput, CampaignDraftSeed, CampaignMechanicType, CampaignProductOption, CampaignType } from "@/src/modules/commercial-campaigns/types";

export default async function AdminCampaignDetailPage({ params, searchParams }: { params: Promise<{ campaignId: string }>; searchParams: Promise<{ preview?: string }> }) {
  const context = await requireAdminPagePermission("campaigns.view");
  const { campaignId } = await params;
  const preview = (await searchParams).preview === "1";
  const service = createCommercialCampaignService();
  const detail = await service.getAdmin(campaignId);
  if (!detail) notFound();
  const campaign = detail.campaign;
  const status = String(campaign.status ?? "");
  const permissions = new Set(context.permissions);
  const canEdit = status === "draft" && permissions.has("campaigns.edit");
  const options = canEdit ? await service.getBuilderOptions() : null;
  return <div className="min-w-0 space-y-6"><AdminPageHeader description={readableCampaignText(campaign.partner_description, "Описание предложения недоступно.")} eyebrow={readableCampaignText(campaign.code, "Предложение")} title={readableCampaignText(campaign.name, "Специальное предложение")} />
    <CampaignAdminActions campaignId={campaignId} canCreate={permissions.has("campaigns.create")} canEdit={permissions.has("campaigns.edit")} canPause={permissions.has("campaigns.pause")} canPublish={permissions.has("campaigns.publish")} status={status} />
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{Object.entries({ Статус: statusLabel(status), Версия: campaign.current_version, Ревизия: campaign.draft_revision ?? 0, Товаров: detail.items.length, Аудитория: detail.audience.filter((row) => row.included).length || "Правило", Заказов: detail.analytics.orders }).map(([label, value]) => <div className="border border-zinc-200 bg-white p-4" key={label}><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 text-xl font-semibold">{String(value)}</p></div>)}</section>
    {preview ? canEdit && options ? <CampaignBuilder initial={seed(campaignId, detail)} options={withSelectedCompanies(options, detail.rules)} preview /> : <DefinitionPreview detail={detail} /> : canEdit && options ? <CampaignBuilder initial={seed(campaignId, detail)} options={withSelectedCompanies(options, detail.rules)} /> : <ReadOnlyDefinition detail={detail} />}
    <section><h2 className="text-lg font-semibold">Аналитика</h2><p className="mt-2 text-sm text-zinc-600">Показы: {detail.analytics.impressions} · Открытия: {detail.analytics.opens} · Корзины: {detail.analytics.carts} · Заказы: {detail.analytics.orders} · Количество: {detail.analytics.attributedQuantity}. Атрибуция портальная и не доказывает причинность.</p></section>
  </div>;
}
function seed(campaignId: string, detail: AdminCampaignDetail): CampaignDraftSeed {
  if (!detail) throw new Error("Campaign detail missing");
  const campaign = detail.campaign;
  const rules = detail.rules;
  const explicit = rules.filter((rule) => rule.rule_type === "explicit_company");
  const rule = rules[0];
  const criterion = record(rule?.criterion) ? rule.criterion : {};
  let audienceMode: CampaignDraftInput["audienceMode"] = "explicit_company";
  if (rule?.rule_type === "all_active_partners") audienceMode = "all_active_partners";
  if (rule?.rule_type === "commercial_mode") audienceMode = criterion.mode === "full" ? "commercial_mode_full" : "commercial_mode_retail_only";
  if (rule?.rule_type === "momentum_status") audienceMode = Array.isArray(criterion.statuses) && criterion.statuses.includes("slowing") ? "momentum_slowing" : "momentum_attention";
  return {
    campaignId, revision: number(campaign.draft_revision),
    values: { code: text(campaign.code), name: text(campaign.name), title: text(campaign.partner_title), description: text(campaign.partner_description), internalNote: text(campaign.internal_note), terms: text(campaign.terms_summary), type: text(campaign.campaign_type) as CampaignType, startsAt: toCampaignDateTimeInput(text(campaign.starts_at)), endsAt: toCampaignDateTimeInput(text(campaign.ends_at)), priority: number(campaign.priority), image: text(campaign.image_asset_path), mechanicType: mechanicType(campaign.mechanic_type) },
    audienceMode,
    companyIds: explicit.flatMap((entry) => record(entry.criterion) && typeof entry.criterion.companyId === "string" ? [entry.criterion.companyId] : []),
    items: detail.items.map((item, index) => { const governed = text(item.benefit_type) === "existing_price_profile"; return { productId: text(item.product_id), sortOrder: number(item.sort_order) || index + 1, minimumQuantity: number(item.minimum_quantity) || 1, maximumQuantityPerCompany: nullableNumber(item.maximum_quantity_per_company), benefitType: governed ? "existing_price_profile" : "informational_only", governedBenefitReference: governed ? SPECIAL_OFFERS_PROMO_PROFILE.externalRef : null, partnerMessage: nullableText(item.partner_message), promoThresholdQuantity: nullableNumber(item.promo_threshold_quantity), requiredBundleQuantity: nullableNumber(item.required_bundle_quantity), attachRole: item.attach_role === "TRIGGER" || item.attach_role === "REWARD" ? item.attach_role : null, requiredTriggerQuantity: nullableNumber(item.required_trigger_quantity), product: product(item) }; }),
  };
}
function product(item: Record<string, unknown>): CampaignProductOption { const price = record(item.currentPrice) ? item.currentPrice : null; const promo = record(item.promoPrice) ? item.promoPrice : null; return { id: text(item.product_id), sku: text(item.sku), model: nullableText(item.model), name: text(item.productName), imageUrl: nullableText(item.imageUrl), categoryId: nullableText(item.categoryId), categoryName: nullableText(item.categoryName), brandId: nullableText(item.brandId), brandName: nullableText(item.brandName), availableQuantity: nullableNumber(item.availableQuantity), currentPrice: price ? { amount: number(price.amount), currency: text(price.currency) } : null, promoPrice: promo ? { amount: number(promo.amount), currency: text(promo.currency) } : null }; }
function withSelectedCompanies(options: CampaignBuilderOptions, rules: Array<Record<string, unknown>>): CampaignBuilderOptions { const known = new Set(options.companies.map((company) => company.id)); const selected = rules.flatMap((rule) => { const criterion = record(rule.criterion) ? rule.criterion : {}; return rule.rule_type === "explicit_company" && typeof criterion.companyId === "string" && typeof rule.companyName === "string" && !known.has(criterion.companyId) ? [{ id: criterion.companyId, name: rule.companyName, status: "active" }] : []; }); return { ...options, companies: [...selected, ...options.companies] }; }
function DefinitionPreview({ detail }: { detail: AdminCampaignDetail }) {
  const campaign = detail.campaign; const image = nullableText(campaign.image_asset_path); const quantityMechanic = mechanicType(campaign.mechanic_type) === "quantity_threshold_promo"; const bundleMechanic = mechanicType(campaign.mechanic_type) === "fixed_bundle_promo";
  return <section className="overflow-hidden rounded-md border border-zinc-200 bg-white"><div className="relative min-h-40 bg-zinc-100">{image ? <Image alt="" className="object-cover" fill sizes="900px" src={image} /> : null}</div><div className="p-5"><p className="text-xs font-semibold uppercase text-emerald-700">Специальное предложение</p><h2 className="mt-1 text-2xl font-semibold">{readableCampaignText(campaign.partner_title, readableCampaignText(campaign.name, "Специальное предложение"))}</h2><p className="mt-2 text-sm text-zinc-600">{readableCampaignText(campaign.partner_description, "Описание предложения недоступно.")}</p><p className="mt-3 text-sm">{localDate(text(campaign.starts_at))} — {localDate(text(campaign.ends_at))}</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{detail.items.map((item) => { const price = record(item.currentPrice) ? item.currentPrice : null; const promo = record(item.promoPrice) ? item.promoPrice : null; return <div className="rounded border p-3" key={String(item.id)}><b>{text(item.sku)} · {readableCampaignText(item.model, readableCampaignText(item.productName, "Товар"))}</b><p className="text-sm text-zinc-600">{price ? `Текущая цена: ${number(price.amount)} ${text(price.currency)}` : "Текущая цена не опубликована"}</p>{item.benefit_type === "existing_price_profile" ? <p className={promo ? "text-sm font-semibold text-emerald-800" : "text-sm text-rose-700"}>{promo ? `Спеццена PROMO: ${number(promo.amount)} ${text(promo.currency)}` : `Для SKU ${text(item.sku)} отсутствует опубликованная цена PROMO.`}</p> : null}<p className="text-xs">{campaign.mechanic_type === "conditional_attach_promo" ? item.attach_role === "TRIGGER" ? `Товар-условие: ${number(item.required_trigger_quantity)} шт. · цена партнёра` : "Товар с PROMO" : bundleMechanic ? `Количество в комплекте: ${number(item.required_bundle_quantity)}` : quantityMechanic ? `От ${number(item.promo_threshold_quantity)} шт. → PROMO` : `Мин. ${number(item.minimum_quantity)}`}{item.maximum_quantity_per_company ? ` · лимит ${number(item.maximum_quantity_per_company)}` : ""}</p></div>; })}</div><p className="mt-4 text-sm">{readableCampaignText(campaign.terms_summary, "Условия предложения недоступны.")}</p></div></section>;
}
function ReadOnlyDefinition({ detail }: { detail: AdminCampaignDetail }) { const quantityMechanic = mechanicType(detail.campaign.mechanic_type) === "quantity_threshold_promo"; const bundleMechanic = mechanicType(detail.campaign.mechanic_type) === "fixed_bundle_promo"; return <section><h2 className="text-lg font-semibold">Состав предложения</h2><div className="mt-3 overflow-x-auto border border-zinc-200 bg-white"><table className="w-full min-w-[760px] text-sm"><thead><tr><th className="p-3 text-left">SKU</th><th className="p-3 text-left">Модель</th><th className="p-3">{bundleMechanic ? "Количество в комплекте" : "Минимум"}</th><th className="p-3">Лимит</th><th className="p-3">Условие</th></tr></thead><tbody>{detail.items.map((item) => <tr className="border-t" key={String(item.id)}><td className="p-3">{String(item.sku)}</td><td className="p-3">{String(item.model || item.productName)}</td><td className="p-3 text-center">{detail.campaign.mechanic_type === "conditional_attach_promo" ? item.attach_role === "TRIGGER" ? String(item.required_trigger_quantity) : String(item.minimum_quantity) : bundleMechanic ? String(item.required_bundle_quantity) : quantityMechanic ? `От ${String(item.promo_threshold_quantity)} шт.` : String(item.minimum_quantity)}</td><td className="p-3 text-center">{item.maximum_quantity_per_company ? String(item.maximum_quantity_per_company) : "Нет ограничения"}</td><td className="p-3">{detail.campaign.mechanic_type === "conditional_attach_promo" ? item.attach_role === "TRIGGER" ? "Товар-условие · цена партнёра" : "Товар с PROMO" : bundleMechanic ? "Комплект → PROMO" : quantityMechanic ? "Количество → PROMO" : item.benefit_type === "existing_price_profile" ? "Спеццена PROMO" : "Текущая цена"}</td></tr>)}</tbody></table></div></section>; }
function localDate(value: string) { return toCampaignDateTimeInput(value); }
function statusLabel(value: string) { return ({ draft: "Черновик", scheduled: "Запланировано", active: "Активно", paused: "Приостановлено", completed: "Завершено", archived: "Архив" } as Record<string, string>)[value] ?? value; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function nullableText(value: unknown) { return typeof value === "string" ? value : null; }
function number(value: unknown) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function nullableNumber(value: unknown) { return value === null || value === undefined ? null : number(value); }
function mechanicType(value: unknown): CampaignMechanicType { return value === "quantity_threshold_promo" || value === "fixed_bundle_promo" || value === "conditional_attach_promo" ? value : "legacy_promo"; }
