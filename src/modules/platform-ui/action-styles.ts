export type ActionLevel = "primary" | "secondary" | "tertiary" | "destructive";

const base = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export const actionClassName: Record<ActionLevel, string> = {
  primary: `${base} bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:ring-emerald-600`,
  secondary: `${base} border border-zinc-300 bg-white text-zinc-800 hover:border-emerald-600 focus-visible:ring-emerald-600`,
  tertiary: `${base} px-2 text-zinc-700 hover:bg-zinc-100 focus-visible:ring-zinc-500`,
  destructive: `${base} border border-red-300 bg-white text-red-700 hover:bg-red-50 focus-visible:ring-red-600`,
};

export type CompactActionLevel = "primary" | "secondary" | "textLink" | "icon";

export const compactActionClassName: Record<CompactActionLevel, string> = {
  primary: "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  secondary: "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-3 text-xs font-semibold text-zinc-800 outline-none hover:border-emerald-600 hover:text-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  textLink: "inline-flex min-h-8 items-center gap-1 rounded text-xs font-semibold text-emerald-700 outline-none hover:text-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-500",
  icon: "inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-600 outline-none hover:bg-zinc-100 hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
};
