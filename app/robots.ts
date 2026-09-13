import type { MetadataRoute } from "next";

import { PUBLIC_SITE_ORIGIN } from "@/src/modules/public-retail/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin/",
          "/api/",
          "/auth/",
          "/cabinet/",
          "/checkout",
          "/onboarding/",
          "/order/",
          "/proposal/",
        ],
      },
      {
        userAgent: ["Amazonbot", "Bytespider", "CCBot", "ClaudeBot", "GPTBot", "meta-externalagent"],
        disallow: "/catalog",
      },
    ],
    host: PUBLIC_SITE_ORIGIN,
    sitemap: `${PUBLIC_SITE_ORIGIN}/sitemap.xml`,
  };
}
