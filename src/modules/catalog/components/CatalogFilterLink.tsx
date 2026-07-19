"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type MouseEvent, type ReactNode, useEffect, useRef, useTransition } from "react";

export function CatalogFilterLink({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className: string;
  href: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const pendingHref = useRef<string | null>(null);

  useEffect(() => {
    if (!pending) pendingHref.current = null;
  }, [pending]);

  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (pendingHref.current === href) return;
    pendingHref.current = href;
    startTransition(() => router.push(href));
  }

  return <Link
    aria-disabled={pending && pendingHref.current === href}
    className={className}
    href={href}
    onClick={navigate}
    prefetch={false}
  >{children}</Link>;
}
