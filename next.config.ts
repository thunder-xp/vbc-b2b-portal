import type { NextConfig } from "next";

const supabaseLogoPattern = (() => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return url.protocol === "https:"
      ? [{ protocol: "https" as const, hostname: url.hostname, pathname: "/storage/v1/render/image/public/company-logos/**" }]
      : [];
  } catch {
    return [];
  }
})();

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
  images: {
    qualities: [70, 75],
    remotePatterns: [
      { protocol: "https", hostname: "firebasestorage.googleapis.com", pathname: "/v0/b/novotech-systems-5449b.appspot.com/o/**" },
      { protocol: "https", hostname: "storage.googleapis.com", pathname: "/novotech-systems-5449b.appspot.com/**" },
      { protocol: "https", hostname: "www.nsd.md", pathname: "/retail/**" },
      { protocol: "https", hostname: "psfbmdfezgyruscqbqbn.supabase.co", pathname: "/storage/v1/object/public/catalog-normalized-images/**" },
      { protocol: "https", hostname: "psfbmdfezgyruscqbqbn.supabase.co", pathname: "/storage/v1/object/public/public-blog-media/**" },
      ...supabaseLogoPattern,
    ],
  },
};

export default nextConfig;
