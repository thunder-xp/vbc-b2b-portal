export type ActionLevel = "primary" | "secondary" | "tertiary" | "destructive";

const base = "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export const actionClassName: Record<ActionLevel, string> = {
  primary: `${base} bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:ring-emerald-600`,
  secondary: `${base} border border-zinc-300 bg-white text-zinc-800 hover:border-emerald-600 focus-visible:ring-emerald-600`,
  tertiary: `${base} px-2 text-zinc-700 hover:bg-zinc-100 focus-visible:ring-zinc-500`,
  destructive: `${base} border border-red-300 bg-white text-red-700 hover:bg-red-50 focus-visible:ring-red-600`,
};
