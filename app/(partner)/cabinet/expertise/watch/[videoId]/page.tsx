import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getPartnerWorkspaceContextAction } from "@/src/modules/partner-cabinet/actions/workspace-context.action";
import { getPartnerExpertiseService } from "@/src/modules/partner-expertise/server";
import { youtubeEmbedUrl } from "@/src/modules/partner-expertise";
import { getPartnerLocale } from "@/src/modules/partner-locale/server";

export default async function ExpertiseWatchPage({ params }: { params: Promise<{ videoId: string }> }) {
  const [{ videoId }, context, locale] = await Promise.all([params, getPartnerWorkspaceContextAction(), getPartnerLocale()]);
  if (!context.success || context.data.accessState !== "active" || !context.data.companyId) redirect("/cabinet");
  const video = await getPartnerExpertiseService().getPartner(context.data.companyId, videoId, locale);
  if (!video) notFound();
  const back = video.section === "LAB" ? "/cabinet/expertise/lab" : "/cabinet/expertise/academy";
  return <main className="mx-auto max-w-5xl space-y-5">
    <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-emerald-700" href={back}>← {locale === "ro" ? "Înapoi" : "Назад"}</Link>
    <header><h1 className="text-2xl font-semibold sm:text-3xl">{video.title}</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600">{video.description}</p></header>
    <div className="aspect-video overflow-hidden bg-black"><iframe allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="size-full" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" src={youtubeEmbedUrl(video.youtubeVideoId)} title={video.title} /></div>
  </main>;
}
