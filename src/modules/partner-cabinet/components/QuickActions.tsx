import Link from "next/link";

const actions = [
  { href: "/cabinet/catalog", label: "Open Catalog", active: true },
  { href: "#", label: "New Order", active: false },
  { href: "#", label: "Fast Order", active: false },
  { href: "#", label: "Documents", active: false },
  { href: "#", label: "Support", active: false },
];

export function QuickActions() {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">Quick actions</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {actions.map((action) =>
          action.active ? (
            <Link
              className="flex h-16 items-center justify-center rounded-md bg-emerald-700 px-4 text-center text-sm font-semibold text-white hover:bg-emerald-800"
              href={action.href}
              key={action.label}
            >
              {action.label}
            </Link>
          ) : (
            <button
              className="flex h-16 items-center justify-center rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-4 text-center text-sm font-semibold text-zinc-500"
              disabled
              key={action.label}
              type="button"
            >
              {action.label}
            </button>
          ),
        )}
      </div>
    </section>
  );
}
