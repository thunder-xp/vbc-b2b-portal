"use client";

import { RouteErrorState } from "@/src/modules/platform-ui";

export default function CatalogError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteErrorState correlationId={error.digest} escapeHref="/cabinet" escapeLabel="Вернуться в кабинет" message="Ранее загруженные коммерческие данные не изменены. Повторите попытку немного позже." reset={reset} title="Каталог временно недоступен" />;
}
