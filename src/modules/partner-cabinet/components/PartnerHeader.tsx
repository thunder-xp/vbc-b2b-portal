import type { ActiveCompanyContextDto } from "@/src/modules/access-control/actions/get-active-company-context.action";
import type { CurrentProfileDto } from "@/src/modules/access-control/actions/current-profile.action";

import { signOutAction } from "@/src/modules/auth/actions/auth.actions";

type PartnerHeaderProps = {
  profile: CurrentProfileDto | null;
  companyContext: ActiveCompanyContextDto | null;
  onMenuClick?: () => void;
};

export function PartnerHeader({
  profile,
  companyContext,
  onMenuClick,
}: PartnerHeaderProps) {
  return (
    <header className="flex min-h-16 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4 py-3 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 text-zinc-700 lg:hidden"
          onClick={onMenuClick}
          type="button"
        >
          <span className="sr-only">Open navigation</span>
          <span className="h-0.5 w-4 bg-current shadow-[0_6px_0_current,0_-6px_0_current]" />
        </button>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-500">Company</p>
          <p className="truncate text-base font-semibold text-zinc-950">
            {companyContext?.company.displayName ?? "Complete onboarding"}
          </p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <div className="hidden min-w-0 text-right sm:block">
          <p className="truncate text-sm font-medium text-zinc-950">
            {profile?.fullName || profile?.email || "Complete Profile"}
          </p>
          <p className="truncate text-xs text-zinc-500">
            {companyContext?.membership.roleId ?? "Profile setup"}
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-semibold text-emerald-800">
          {(profile?.fullName || profile?.email || "P").slice(0, 1).toUpperCase()}
        </div>
        <form action={signOutAction}>
          <button
            className="hidden h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 sm:inline-flex"
            type="submit"
          >
            Logout
          </button>
        </form>
      </div>
    </header>
  );
}
