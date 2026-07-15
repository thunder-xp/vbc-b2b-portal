export default function OrdersLoading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-6" aria-label="Загрузка заказов">
      <div className="h-16 w-64 rounded-md bg-zinc-200" />
      <div className="h-72 rounded-md border border-zinc-200 bg-white" />
    </div>
  );
}
