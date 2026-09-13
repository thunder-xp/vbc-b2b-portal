import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const CANONICAL_HOST = "www.nsd.md";
const NON_SEARCH_CATALOG_CRAWLER = /\b(?:ClaudeBot|GPTBot|Amazonbot|Bytespider|CCBot|meta-externalagent)\b/i;

export function proxy(request: NextRequest) {
  if (request.nextUrl.hostname.toLowerCase() === "nsd.md") {
    const target = request.nextUrl.clone();
    target.protocol = "https:";
    target.hostname = CANONICAL_HOST;
    target.port = "";
    return NextResponse.redirect(target, 308);
  }

  if (request.nextUrl.pathname === "/catalog" && NON_SEARCH_CATALOG_CRAWLER.test(request.headers.get("user-agent") ?? "")) {
    return new NextResponse(null, {
      status: 403,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    "x-novotech-document-locale",
    request.nextUrl.searchParams.get("lang") === "ro" ? "ro" : "ru",
  );
  requestHeaders.delete("x-novotech-popular-session");
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|robots.txt|sitemap.xml).*)",
};
