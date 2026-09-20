import { describe, expect, it } from "vitest";
import { normalizeYouTubeUrl, youtubeEmbedUrl } from "../youtube";

describe("YouTube URL governance", () => {
  it.each([
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
  ])("normalizes supported URL %s", (url) => {
    expect(normalizeYouTubeUrl(url)).toMatchObject({ videoId: "dQw4w9WgXcQ", canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
  });
  it.each(["https://example.com/watch?v=dQw4w9WgXcQ", "http://youtu.be/dQw4w9WgXcQ", "https://youtu.be/not-valid", "<iframe></iframe>"])("rejects unsafe URL %s", (url) => {
    expect(() => normalizeYouTubeUrl(url)).toThrow("INVALID_YOUTUBE_URL");
  });
  it("derives a privacy-enhanced embed from the governed ID", () => {
    expect(youtubeEmbedUrl("dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });
});
