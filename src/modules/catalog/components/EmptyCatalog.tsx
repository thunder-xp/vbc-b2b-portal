type EmptyCatalogProps = {
  title: string;
  message: string;
};

export function EmptyCatalog({ title, message }: EmptyCatalogProps) {
  return (
    <section className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center">
      <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-600">
        {message}
      </p>
    </section>
  );
}
