import type { Metadata } from "next";
import { PublicLegalDocumentPage } from "@/src/modules/public-retail/components/PublicLegalDocumentPage";
export const metadata: Metadata = { title: "Delivery | Novotech" };
export default function DeliveryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <PublicLegalDocumentPage kind="delivery" searchParams={searchParams} />; }
