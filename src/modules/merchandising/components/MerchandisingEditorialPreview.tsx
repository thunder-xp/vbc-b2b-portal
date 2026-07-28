import { Eye, PackageCheck } from "lucide-react";

import type { AdminMerchandisingPreview } from "../types";
import { MerchandisingBadges } from "../../catalog/components/MerchandisingBadges";
import { ProductThumbnail } from "../../catalog/components/ProductThumbnail";

const SECTION_TITLES = {
  TOP: "Популярные товары",
  NEW: "Новинки",
  HOT: "Горячие предложения",
} as const;

export function MerchandisingEditorialPreview({
  preview,
}: {
  preview: AdminMerchandisingPreview;
}) {
  return (
    <div className="space-y-7">
      <div className="flex items-start gap-3 border-y border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        <Eye aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">Редакционный режим, только чтение</p>
          <p className="mt-0.5 text-emerald-800">
            Показаны только сохранённые назначения. Цены компаний и действия
            партнёра недоступны.
          </p>
        </div>
      </div>

      {preview.sections.length ? (
        preview.sections.map((section) => (
          <section
            aria-labelledby={`preview-${section.labelCode}`}
            key={section.labelCode}
          >
            <h2
              className="mb-3 text-lg font-semibold text-zinc-950"
              id={`preview-${section.labelCode}`}
            >
              {SECTION_TITLES[section.labelCode]}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {section.products.map((product) => (
                <article
                  className="overflow-hidden rounded-md border border-zinc-200 bg-white"
                  key={`${section.labelCode}:${product.id}`}
                >
                  <div className="relative aspect-[4/3] bg-zinc-100">
                    {product.imageUrl ? (
                      <ProductThumbnail
                        alt={product.name}
                        className="object-contain p-3"
                        sizes="(max-width: 639px) 100vw, 25vw"
                        src={product.imageUrl}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-zinc-400">
                        Нет фото
                      </div>
                    )}
                  </div>
                  <div className="space-y-2 p-3">
                    <MerchandisingBadges labels={[section.labelCode]} />
                    <p className="text-xs uppercase text-zinc-500">
                      SKU {product.sku}
                    </p>
                    <h3 className="text-sm font-semibold text-zinc-950">
                      {product.name}
                    </h3>
                    <p className="text-xs text-zinc-500">
                      {product.categoryName ?? "Без категории"}
                      {product.brandName ? ` · ${product.brandName}` : ""}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-700">
                      <PackageCheck aria-hidden="true" className="size-4" />
                      {stockText(product.stockState)}
                    </p>
                    <p className="text-xs text-zinc-500">
                      Приоритет: {product.priority}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="border-y border-zinc-200 py-12 text-center">
          <p className="font-semibold text-zinc-800">
            В опубликованной витрине пока нет товаров
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Назначьте активному товару метку и период публикации.
          </p>
        </div>
      )}
    </div>
  );
}

function stockText(
  stockState: "in_stock" | "expected" | "unavailable",
): string {
  if (stockState === "in_stock") return "В наличии";
  if (stockState === "expected") return "Ожидается поступление";
  return "Наличие уточняется";
}
