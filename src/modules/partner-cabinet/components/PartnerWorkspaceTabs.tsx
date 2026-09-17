import Link from "next/link";

export type PartnerWorkspaceTab = {
  key: string;
  label: string;
  href: string;
};

export function PartnerWorkspaceTabs({
  activeKey,
  ariaLabel,
  tabs,
}: {
  activeKey: string;
  ariaLabel: string;
  tabs: readonly PartnerWorkspaceTab[];
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-md border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
              active
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-zinc-300 bg-white text-zinc-800 hover:border-emerald-700"
            }`}
            href={tab.href}
            key={tab.key}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
