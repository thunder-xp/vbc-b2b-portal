import { redirect } from "next/navigation";

import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";
import { getPartnerExpertiseService } from "./server";
import type { ExpertiseSection } from "./types";
import { PartnerExpertiseGrid } from "./PartnerExpertiseGrid";

const copy = {
  LAB: {
    ru: { title: "Лаборатория Novotech", subtitle: "Решения, технологии и практические демонстрации для профессиональных интеграторов.", empty: "Новые материалы скоро появятся." },
    ro: { title: "Laboratorul Novotech", subtitle: "Soluții, tehnologii și demonstrații practice pentru integratori profesioniști.", empty: "Materiale noi vor apărea în curând." },
  },
  ACADEMY: {
    ru: { title: "Академия Novotech", subtitle: "Обучающие материалы для проектирования, монтажа и настройки систем безопасности.", empty: "Обучающие материалы скоро появятся." },
    ro: { title: "Academia Novotech", subtitle: "Materiale educaționale pentru proiectarea, instalarea și configurarea sistemelor de securitate.", empty: "Materialele educaționale vor apărea în curând." },
  },
} as const;

export async function PartnerExpertisePage({ section }: { section: ExpertiseSection }) {
  const [context, locale] = await Promise.all([getPartnerWorkspaceContextAction(), getPartnerLocale()]);
  if (!context.success || context.data.accessState !== "active" || !context.data.companyId) redirect("/cabinet");
  const videos = await getPartnerExpertiseService().listPartner(context.data.companyId, section, locale);
  const t = copy[section][locale];
  return <main className="mx-auto max-w-6xl space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{locale === "ro" ? "Expertiza Novotech" : "Экспертиза Novotech"}</p><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{t.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{t.subtitle}</p></header>
    <PartnerExpertiseGrid empty={t.empty} locale={locale} videos={videos} />
  </main>;
}
