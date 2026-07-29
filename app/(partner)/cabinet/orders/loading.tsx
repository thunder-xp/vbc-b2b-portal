import { LoadingState } from "@/src/modules/platform-ui";

export default function OrdersLoading() {
  return <div className="mx-auto max-w-6xl"><LoadingState label="Загрузка заказов" rows={3} /></div>;
}
