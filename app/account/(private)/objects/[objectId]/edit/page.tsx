import Link from "next/link";
import { notFound } from "next/navigation";

import { WorkspaceHeader, cabinetPageNarrow, cabinetTextAction } from "@/src/modules/cabinet-experience/components";
import { CustomerObjectForm } from "@/src/modules/final-customer/components";
import { getFinalCustomerLocale } from "@/src/modules/final-customer/locale";
import { createFinalCustomerService, getFinalCustomerContext } from "@/src/modules/final-customer/server";

export default async function EditCustomerObjectPage({ params }: { params: Promise<{ objectId: string }> }) {
  const [{ objectId }, context, locale] = await Promise.all([params, getFinalCustomerContext(), getFinalCustomerLocale()]);
  const object = await createFinalCustomerService().customerObject(context.account, objectId);
  if (!object || object.status !== "ACTIVE") notFound();
  const ro = locale === "ro";
  return <main className={cabinetPageNarrow}>
    <Link className={cabinetTextAction} href={`/account/objects/${object.id}`}>← {object.name}</Link>
    <WorkspaceHeader title={ro ? "Editează obiectul" : "Редактировать объект"} />
    <CustomerObjectForm locale={locale} object={object} />
  </main>;
}
