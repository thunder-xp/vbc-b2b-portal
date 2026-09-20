import "server-only";

import type { ProfessionalRegistrationIntent } from "./redirects";

export function registrationEmailRedirectUrl(
  intent: ProfessionalRegistrationIntent,
  locale: "ru" | "ro",
  nextPath: string,
  configuredOrigin = process.env.PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://www.nsd.md",
): string {
  const origin = new URL(configuredOrigin);
  if ((process.env.NODE_ENV === "production" && origin.protocol !== "https:")
    || (origin.protocol !== "https:" && origin.hostname !== "localhost")) {
    throw new Error("Public application URL is invalid.");
  }
  const target = new URL("/auth/sign-in", origin.origin);
  target.searchParams.set("confirmed", "1");
  target.searchParams.set("lang", locale);
  target.searchParams.set("intent", intent);
  target.searchParams.set("next", nextPath);
  return target.toString();
}
