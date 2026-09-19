import { cabinetPage, cabinetSurface } from "./WorkspaceHeader";

export function CabinetLoadingState() {
  return <main aria-busy="true" aria-label="Loading" className={cabinetPage}>
    <div className="motion-safe:animate-pulse motion-reduce:animate-none">
      <div className="h-7 w-48 rounded bg-zinc-200" />
      <div className="mt-2 h-4 w-full max-w-sm rounded bg-zinc-200" />
    </div>
    <div className={`divide-y divide-zinc-100 overflow-hidden ${cabinetSurface}`}>
      {[0, 1, 2].map((item) => <div className="flex min-h-20 items-center gap-3 p-4" key={item}>
        <div className="size-10 shrink-0 rounded-lg bg-zinc-100 motion-safe:animate-pulse motion-reduce:animate-none" />
        <div className="min-w-0 flex-1 space-y-2 motion-safe:animate-pulse motion-reduce:animate-none"><div className="h-4 w-2/3 rounded bg-zinc-200" /><div className="h-3 w-1/3 rounded bg-zinc-100" /></div>
      </div>)}
    </div>
  </main>;
}
