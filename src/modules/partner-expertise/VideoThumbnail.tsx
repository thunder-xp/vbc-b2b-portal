"use client";

import Image from "next/image";
import { Play } from "lucide-react";
import { useState } from "react";

import { youtubeThumbnailUrl } from "./youtube";

export function VideoThumbnail({ videoId, alt, priority = false }: { videoId: string; alt: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className="relative aspect-video overflow-hidden bg-zinc-100">
    {failed ? <div className="flex size-full items-center justify-center text-zinc-400" role="img" aria-label={alt}><Play aria-hidden="true" className="size-10" /></div> :
      <Image alt={alt} className="object-cover" fill loading={priority ? "eager" : "lazy"} onError={() => setFailed(true)} priority={priority} sizes="(min-width: 1280px) 30vw, (min-width: 640px) 45vw, 100vw" src={youtubeThumbnailUrl(videoId)} />}
  </div>;
}
