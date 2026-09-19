import "server-only";

import { headers } from "next/headers";

import type { AgentCabinetLocale } from "./copy";

export async function getAgentCabinetLocale(): Promise<AgentCabinetLocale> {
  return (await headers()).get("x-novotech-document-locale") === "ro" ? "ro" : "ru";
}
