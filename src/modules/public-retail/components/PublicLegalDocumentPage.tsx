import Link from "next/link";

import { publicRetailLocale } from "../presentation";
import { legalDocuments } from "../legal/public-legal-content";
import { PublicRetailShell } from "./PublicRetailShell";

type LegalKind = keyof typeof legalDocuments;

export async function PublicLegalDocumentPage({ kind, searchParams }: { kind: LegalKind; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const locale = publicRetailLocale((await searchParams).lang);
  const document = legalDocuments[kind][locale];
  const date = new Intl.DateTimeFormat(locale === "ru" ? "ru-MD" : "ro-MD", { dateStyle: "long", timeZone: "Europe/Chisinau" }).format(new Date(document.effectiveAt));
  return <PublicRetailShell languagePath={`/${kind}`} locale={locale}>
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <header className="border-b border-zinc-200 pb-7">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{document.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{document.title}</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-600">{document.summary}</p>
        <p className="mt-4 text-xs text-zinc-500">{locale === "ru" ? "Версия" : "Versiune"}: {document.version} · {locale === "ru" ? "действует с" : "în vigoare din"} {date}</p>
      </header>
      <div className="divide-y divide-zinc-200">
        {document.sections.map((section) => <section className="py-7" key={section.title}>
          <h2 className="text-xl font-semibold">{section.title}</h2>
          <div className="mt-3 space-y-3 text-sm leading-7 text-zinc-700">{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
        </section>)}
      </div>
      <div className="border-t border-zinc-200 pt-6 text-sm">
        <Link className="inline-flex min-h-11 items-center font-semibold text-blue-800 underline underline-offset-4" href={`/contacts?lang=${locale}`}>{locale === "ru" ? "Контакты Novotech" : "Contacte Novotech"}</Link>
      </div>
    </main>
  </PublicRetailShell>;
}
