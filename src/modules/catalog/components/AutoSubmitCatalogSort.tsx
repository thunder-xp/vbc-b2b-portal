"use client";

import type { ComponentProps, ReactNode } from "react";

export function AutoSubmitCatalogSort({
  children,
  ...props
}: {
  children: ReactNode;
} & Omit<ComponentProps<"select">, "onChange">) {
  return (
    <select
      {...props}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
    >
      {children}
    </select>
  );
}
