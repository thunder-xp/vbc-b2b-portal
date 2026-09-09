import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

const CANONICAL_HOST = "www.nsd.md";
const POPULAR_SESSION_COOKIE = "novotech_popular_session";
const POPULAR_SESSION_HEADER = "x-novotech-popular-session";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function proxy(request: NextRequest) {
  if (request.nextUrl.hostname.toLowerCase() === "nsd.md") {
    const target = request.nextUrl.clone();
    target.protocol = "https:";
    target.hostname = CANONICAL_HOST;
    target.port = "";
    return NextResponse.redirect(target, 308);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    "x-novotech-document-locale",
    request.nextUrl.searchParams.get("lang") === "ro" ? "ro" : "ru",
  );
  const existingPopularSession = request.cookies.get(POPULAR_SESSION_COOKIE)?.value;
  const shouldIssuePopularSession = request.nextUrl.pathname === "/catalog"
    && !UUID.test(existingPopularSession ?? "");
  const popularSession = shouldIssuePopularSession
    ? randomUUID()
    : existingPopularSession;
  if (request.nextUrl.pathname === "/catalog" && popularSession) {
    requestHeaders.set(POPULAR_SESSION_HEADER, popularSession.toLowerCase());
  } else {
    requestHeaders.delete(POPULAR_SESSION_HEADER);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (shouldIssuePopularSession && popularSession) {
    response.cookies.set(POPULAR_SESSION_COOKIE, popularSession.toLowerCase(), {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/",
    });
  }
  return response;
}

export const config = {
  matcher: "/((?!api|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|robots.txt|sitemap.xml).*)",
};
