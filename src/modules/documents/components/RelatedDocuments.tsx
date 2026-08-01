import type { PartnerDocumentListItem } from "../types";
import { DocumentCard } from "./DocumentCard";

export function RelatedDocuments({ title, documents, emptyMessage }: { title: string; documents: PartnerDocumentListItem[]; emptyMessage: string }) {
  return <section className="border-t border-zinc-200 pt-6"><h2 className="text-lg font-semibold text-zinc-950">{title}</h2>{documents.length?<div className="mt-2">{documents.map((document)=><DocumentCard compact document={document} key={document.id}/>)}</div>:<p className="mt-3 text-sm text-zinc-600">{emptyMessage}</p>}</section>;
}

