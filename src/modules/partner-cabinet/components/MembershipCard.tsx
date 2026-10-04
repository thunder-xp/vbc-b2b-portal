import { companyCopy, type PartnerLocale } from "../../partner-locale";
import type { PartnerWorkspaceContext } from "../services";
import { StatusBadge } from "./StatusBadge";

export function MembershipCard({ context, locale = "ru" }: { context: PartnerWorkspaceContext; locale?: PartnerLocale }) {
  const copy = companyCopy(locale);
  return <article className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold text-zinc-950">{context.companyName}</h2><p className="mt-1 text-sm text-zinc-600">{context.membershipRole}</p></div><StatusBadge label={context.accessState === "active" ? copy.active : copy.setupRequired} tone={context.accessState === "active" ? "green" : "amber"} /></div><p className="mt-5 text-sm text-zinc-600">{copy.membershipScope}</p></article>;
}
