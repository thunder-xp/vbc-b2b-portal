import { CatalogFilterCloseButton, CatalogFilterToggle } from "./CatalogFilterToggle";

export function CatalogFilterShell({
  children,
  closeLabel = "Закрыть фильтры",
  panelLabel = "Фильтры каталога",
  selectedCount,
  square = false,
  triggerLabel = "Фильтры",
}: {
  children: React.ReactNode;
  closeLabel?: string;
  panelLabel?: string;
  selectedCount: number;
  square?: boolean;
  triggerLabel?: string;
}) {
  const panelId = "catalog-filter-panel";
  return <>
    <CatalogFilterToggle closeLabel={closeLabel} panelId={panelId} selectedCount={selectedCount} square={square} triggerLabel={triggerLabel} />
    <aside
      aria-label={panelLabel}
      className={`hidden border border-zinc-200 bg-white p-4 data-[open=true]:fixed data-[open=true]:inset-y-0 data-[open=true]:right-0 data-[open=true]:z-50 data-[open=true]:block data-[open=true]:w-[min(22rem,calc(100vw-2rem))] data-[open=true]:overflow-y-auto data-[open=true]:shadow-2xl lg:static lg:block lg:w-auto lg:shadow-sm ${square ? "" : "rounded-l-lg lg:rounded-lg"}`}
      id={panelId}
    >
      <div className="mb-3 flex justify-end lg:hidden">
        <CatalogFilterCloseButton closeLabel={closeLabel} panelId={panelId} square={square} />
      </div>
      {children}
    </aside>
  </>;
}
