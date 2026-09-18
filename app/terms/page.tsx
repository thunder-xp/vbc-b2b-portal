import type { Metadata } from "next";
import { PublicLegalDocumentPage } from "@/src/modules/public-retail/components/PublicLegalDocumentPage";
export const metadata: Metadata = { title: "Terms and conditions | Novotech" };
export default function TermsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <PublicLegalDocumentPage kind="terms" searchParams={searchParams} />; }
