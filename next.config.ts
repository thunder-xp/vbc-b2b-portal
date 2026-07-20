import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { remotePatterns: [
    { protocol: "https", hostname: "firebasestorage.googleapis.com", pathname: "/v0/b/novotech-systems-5449b.appspot.com/o/**" },
    { protocol: "https", hostname: "storage.googleapis.com", pathname: "/novotech-systems-5449b.appspot.com/**" },
  ] },
};

export default nextConfig;
