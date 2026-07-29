"use client";

import { RouteErrorState } from "@/src/modules/platform-ui";

export default function OrdersError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorState correlationId={error.digest} escapeHref="/cabinet/catalog" escapeLabel="Вернуться в каталог" message="Ранее загруженные заказы сохранены. Повторите попытку или вернитесь в каталог." reset={reset} title="Не удалось открыть заказы" />;
}
