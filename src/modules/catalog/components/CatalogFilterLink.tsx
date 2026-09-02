import Link from "next/link";
import type { ReactNode } from "react";

export function CatalogFilterLink({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className: string;
  href: string;
}) {
  return <Link className={className} href={href} prefetch={false}>{children}</Link>;
}
