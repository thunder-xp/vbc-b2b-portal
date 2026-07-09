type SearchBoxProps = {
  categoryId?: string;
  brandId?: string;
  search?: string;
};

export function SearchBox({ categoryId, brandId, search }: SearchBoxProps) {
  return (
    <form action="/cabinet/catalog" className="flex flex-col gap-3 sm:flex-row">
      {categoryId && <input name="category" type="hidden" value={categoryId} />}
      {brandId && <input name="brand" type="hidden" value={brandId} />}
      <input
        className="h-11 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm outline-none focus:border-emerald-700"
        defaultValue={search}
        name="search"
        placeholder="Search by product name or SKU"
        type="search"
      />
      <button
        className="h-11 rounded-md bg-emerald-700 px-4 text-sm font-medium text-white hover:bg-emerald-800"
        type="submit"
      >
        Search
      </button>
    </form>
  );
}
