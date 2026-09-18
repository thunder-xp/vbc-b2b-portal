import type { Metadata } from "next";
import { PublicLegalDocumentPage } from "@/src/modules/public-retail/components/PublicLegalDocumentPage";
export const metadata: Metadata = { title: "Returns | Novotech" };
export default function ReturnsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <PublicLegalDocumentPage kind="returns" searchParams={searchParams} />; }
