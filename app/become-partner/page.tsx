import type { Metadata } from "next";
import { BriefcaseBusiness, Wrench } from "lucide-react";
import Link from "next/link";

import { PublicRetailShell } from "@/src/modules/public-retail/components/PublicRetailShell";
import { PublicStructuredData } from "@/src/modules/public-retail/components/PublicStructuredData";
import { publicRetailLocale } from "@/src/modules/public-retail/presentation";
import { buildPublicMetadata, publicBreadcrumbSchema, publicLocalizedUrl } from "@/src/modules/public-retail/seo";

type Params = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const locale = publicRetailLocale((await searchParams).lang);
  return buildPublicMetadata({
    locale,
    path: "/become-partner",
    title: locale === "ru" ? "Стать партнёром | Novotech" : "Devino partener | Novotech",
    description: locale === "ru"
      ? "Выберите формат профессионального сотрудничества с Novotech."
      : "Alegeți forma de colaborare profesională cu Novotech.",
  });
}

export default async function BecomePartnerPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const locale = publicRetailLocale(params.lang);
  const ru = locale === "ru";
  const nextPath = safeNextPath(params.next);
  const installerQuery = new URLSearchParams({ lang: locale, intent: "installer" });
  if (nextPath) installerQuery.set("next", nextPath);
  const schema = publicBreadcrumbSchema([
    { name: ru ? "Главная" : "Principală", url: publicLocalizedUrl("/", locale) },
    { name: ru ? "Стать партнёром" : "Devino partener", url: publicLocalizedUrl("/become-partner", locale) },
  ]);

  return (
    <PublicRetailShell languagePath="/become-partner" locale={locale}>
      <PublicStructuredData data={schema} />
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <header className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">NOVOTECH SYSTEMS</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{ru ? "Как вы хотите сотрудничать с Novotech?" : "Cum doriți să colaborați cu Novotech?"}</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-600">{ru ? "Выберите направление. Для каждого действует отдельный процесс проверки и активации." : "Alegeți direcția. Fiecare are un proces separat de verificare și activare."}</p>
        </header>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <Link className="group flex min-h-44 flex-col rounded-md border border-zinc-200 bg-white p-5 transition-colors hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700" href={`/become-partner/agent?lang=${locale}`}>
            <BriefcaseBusiness aria-hidden="true" className="size-6 text-blue-700" />
            <h2 className="mt-4 text-lg font-semibold text-zinc-950">{ru ? "Коммерческий агент" : "Agent comercial"}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{ru ? "Заявка проходит отдельную проверку, согласование и активацию. Компания партнёра автоматически не создаётся." : "Cererea trece prin verificare, aprobare și activare separată. Nu se creează automat o companie parteneră."}</p>
            <span className="mt-auto pt-4 text-sm font-semibold text-blue-800">{ru ? "Начать заявку" : "Începe cererea"} →</span>
          </Link>
          <Link className="group flex min-h-44 flex-col rounded-md border border-zinc-200 bg-white p-5 transition-colors hover:border-emerald-300 hover:bg-emerald-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700" href={`/auth/register?${installerQuery.toString()}`}>
            <Wrench aria-hidden="true" className="size-6 text-emerald-700" />
            <h2 className="mt-4 text-lg font-semibold text-zinc-950">{ru ? "Профессиональный инсталлятор" : "Instalator profesionist"}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{ru ? "Регистрация запускает существующий процесс бизнес-доступа. Участие в Marketplace подключается отдельно." : "Înregistrarea pornește procesul existent de acces business. Participarea în Marketplace se activează separat."}</p>
            <span className="mt-auto pt-4 text-sm font-semibold text-emerald-800">{ru ? "Создать аккаунт" : "Creează cont"} →</span>
          </Link>
        </div>
      </main>
    </PublicRetailShell>
  );
}

function safeNextPath(value: string | string[] | undefined) {
  const candidate = typeof value === "string" ? value : null;
  return candidate?.startsWith("/") && !candidate.startsWith("//") && candidate.length <= 500
    ? candidate
    : undefined;
}
