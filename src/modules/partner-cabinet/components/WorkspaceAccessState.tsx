import { companyCopy, type PartnerLocale } from "../../partner-locale";
import type { PartnerWorkspaceAccessState } from "../services";

export function WorkspaceAccessState({ state, locale = "ru" }: { state: Extract<PartnerWorkspaceAccessState, "suspended" | "missing_membership" | "missing_company"> | "unavailable"; locale?: PartnerLocale }) {
  const copy = companyCopy(locale);
  const states = {
    suspended: [copy.suspendedTitle, copy.suspendedMessage],
    missing_membership: [copy.missingMembershipTitle, copy.missingMembershipMessage],
    missing_company: [copy.missingCompanyTitle, copy.missingCompanyMessage],
    unavailable: [copy.workspaceUnavailable, copy.workspaceUnavailableMessage],
  } as const;
  const [title, message] = states[state];
  return <section className="mx-auto max-w-2xl rounded-lg border border-amber-200 bg-white p-6 shadow-sm"><h1 className="text-xl font-semibold text-zinc-950">{title}</h1><p className="mt-3 text-sm leading-6 text-zinc-600">{message}</p></section>;
}
