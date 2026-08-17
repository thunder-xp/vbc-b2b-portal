import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const CANONICAL_HOST = "www.nsd.md";

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
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: "/((?!api|_next/static|_next/image|favicon.ico).*)",
};
