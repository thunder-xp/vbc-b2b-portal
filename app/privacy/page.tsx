import type { Metadata } from "next";
import { PublicLegalDocumentPage } from "@/src/modules/public-retail/components/PublicLegalDocumentPage";
export const metadata: Metadata = { title: "Privacy policy | Novotech" };
export default function PrivacyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { return <PublicLegalDocumentPage kind="privacy" searchParams={searchParams} />; }
