import Link from "next/link";
import { PackageOpen } from "lucide-react";

import type { FinalCustomerLocale } from "../locale";
import { CabinetEmptyState as SharedCabinetEmptyState, cabinetPrimaryAction, cabinetSecondaryAction } from "@/src/modules/cabinet-experience/components";

export function CustomerEmptyState({
  locale,
  title,
  body,
  showService = true,
  primaryHref,
  primaryLabel,
}: {
  locale: FinalCustomerLocale;
  title: string;
  body: string;
  showService?: boolean;
  primaryHref?: string;
  primaryLabel?: string;
}) {
  const ro = locale === "ro";
  return <SharedCabinetEmptyState
    Icon={PackageOpen}
    actions={<><Link className={cabinetPrimaryAction} href={primaryHref ?? `/catalog?lang=${locale}&view=all`}>{primaryLabel ?? (ro ? "Deschide catalogul" : "Открыть каталог")}</Link>{showService ? <Link className={cabinetSecondaryAction} href="/account/service/new">{ro ? "Contactați service-ul" : "Обратиться в сервис"}</Link> : null}</>}
    body={body}
    title={title}
  />;
}
