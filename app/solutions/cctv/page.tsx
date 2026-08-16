import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

import { publicRetailLocale } from "@/src/modules/public-retail/presentation";

export const metadata: Metadata = {
  title: "Подбор системы видеонаблюдения | Novotech",
  description: "Путь к подбору совместимой системы видеонаблюдения для вашего объекта.",
  alternates: { canonical: "/calculator/cctv" },
};

export default async function PublicCctvEntry({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const locale = publicRetailLocale(query.lang);
  const object = Array.isArray(query.object) ? query.object[0] : query.object;
  permanentRedirect(`/calculator/cctv?lang=${locale}${object && /^[a-z]+$/.test(object) ? `&object=${object}` : ""}`);
}
