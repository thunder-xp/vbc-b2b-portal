"use client";

import { EmptyCatalog } from "@/src/modules/catalog/components";

export default function CatalogError() {
  return (
    <EmptyCatalog
      message="The catalog could not be loaded. Please try again later."
      title="Catalog unavailable"
    />
  );
}
