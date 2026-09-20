import Link from "next/link";
import { Play } from "lucide-react";

import type { ExpertiseLocale, PartnerExpertiseVideo } from "./types";
import { VideoThumbnail } from "./VideoThumbnail";

export function PartnerExpertiseGrid({ videos, locale, empty }: { videos: PartnerExpertiseVideo[]; locale: ExpertiseLocale; empty: string }) {
  if (videos.length === 0) return <div className="border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-600">{empty}</div>;
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{videos.map((video, index) =>
    <article className="flex min-w-0 flex-col overflow-hidden border border-zinc-200 bg-white" key={video.id}>
      <VideoThumbnail alt={video.title} priority={index < 3} videoId={video.youtubeVideoId} />
      <div className="flex flex-1 flex-col p-4">
        <h2 className="line-clamp-2 font-semibold leading-6">{video.title}</h2>
        <p className="mt-2 line-clamp-3 text-sm leading-5 text-zinc-600">{video.description}</p>
        <Link className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white" href={`/cabinet/expertise/watch/${video.id}`}>
          <Play aria-hidden="true" className="size-4" />{locale === "ro" ? "Vizionați" : "Смотреть"}
        </Link>
      </div>
    </article>)}</div>;
}
