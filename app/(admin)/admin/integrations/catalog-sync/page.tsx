import { CatalogSyncPanel } from "@/src/modules/integration/components";

export default function CatalogSyncPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-700">
            Integrations
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">
            Manual catalog sync
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Imports category, brand, and product read-model data. Pricing,
            stock, documents, orders, and finance are outside this sync.
          </p>
        </div>

        <CatalogSyncPanel />
      </div>
    </main>
  );
}
