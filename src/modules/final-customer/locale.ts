import "server-only";

import { headers } from "next/headers";

export type FinalCustomerLocale = "ru" | "ro";

export async function getFinalCustomerLocale(): Promise<FinalCustomerLocale> {
  return (await headers()).get("x-novotech-document-locale") === "ro" ? "ro" : "ru";
}

export { finalCustomerCopy } from "./copy";
