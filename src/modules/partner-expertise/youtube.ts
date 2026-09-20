import { z } from "zod";

const videoIdSchema = z.string().regex(/^[A-Za-z0-9_-]{11}$/);

export type NormalizedYouTubeVideo = {
  videoId: string;
  canonicalUrl: string;
  thumbnailUrl: string;
  embedUrl: string;
};

export function normalizeYouTubeUrl(input: string): NormalizedYouTubeVideo {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("INVALID_YOUTUBE_URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new Error("INVALID_YOUTUBE_URL");
  }

  const host = url.hostname.toLowerCase();
  let candidate: string | null = null;
  if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host)) {
    if (url.pathname === "/watch") candidate = url.searchParams.get("v");
    else {
      const match = url.pathname.match(/^\/shorts\/([^/]+)\/?$/);
      candidate = match?.[1] ?? null;
    }
  } else if (host === "youtu.be") {
    candidate = url.pathname.match(/^\/([^/]+)\/?$/)?.[1] ?? null;
  }
  const parsed = videoIdSchema.safeParse(candidate);
  if (!parsed.success) throw new Error("INVALID_YOUTUBE_URL");

  return {
    videoId: parsed.data,
    canonicalUrl: `https://www.youtube.com/watch?v=${parsed.data}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${parsed.data}/hqdefault.jpg`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${parsed.data}`,
  };
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoIdSchema.parse(videoId)}/hqdefault.jpg`;
}

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoIdSchema.parse(videoId)}`;
}
