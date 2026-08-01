import type { DocumentDTO } from "../../integration/dto";
import { ONE_C_DOCUMENT_SOURCES, type OneCDocumentODataProvider } from "../../integration/providers/one-c";

export type DocumentSyncLease = { syncId: string; sourceIndex: number; nextSkip: number; resumed: boolean; locked: boolean };
export type DocumentSyncPublication = { published: number; mapped: number; unmapped: number; linkedOrders: number; unlinkedOrders: number };
export type DocumentSyncResult = { syncId: string; completed: boolean; pagesProcessed: number; publication: DocumentSyncPublication | null };

export interface DocumentSyncRepository {
  beginOrResume(): Promise<DocumentSyncLease>;
  stagePage(input: { syncId: string; sourceIndex: number; sourceEntity: string; nextSourceIndex: number; nextSkip: number; received: number; rejected: number; rows: DocumentSyncStageRow[] }): Promise<void>;
  publish(syncId: string): Promise<DocumentSyncPublication>;
  release(syncId: string): Promise<void>;
  fail(syncId: string, safeErrorCode: string): Promise<void>;
}

export type DocumentSyncStageRow = {
  source_index: number; source_entity: string; source_document_ref: string; document_type: string;
  title: string; document_number: string; document_date: string; posted: boolean;
  deletion_marked: boolean; counterparty_ref: string; contract_ref: string | null;
  order_ref: string | null; base_document_ref: string | null; correction_ref: string | null;
  currency_ref: string | null; source_version: string | null;
};

export class DocumentMetadataSyncService {
  constructor(private readonly repository: DocumentSyncRepository, private readonly provider: OneCDocumentODataProvider) {}

  async run(maxPages = 20): Promise<DocumentSyncResult> {
    const lease = await this.repository.beginOrResume();
    if (lease.locked) return { syncId: lease.syncId, completed: false, pagesProcessed: 0, publication: null };
    let sourceIndex = lease.sourceIndex;
    let skip = lease.nextSkip;
    let pagesProcessed = 0;
    try {
      while (sourceIndex < ONE_C_DOCUMENT_SOURCES.length && pagesProcessed < boundedPages(maxPages)) {
        const source = ONE_C_DOCUMENT_SOURCES[sourceIndex];
        const page = await this.provider.fetchSourcePage(source, skip, 100);
        const nextSourceIndex = page.nextSkip === null ? sourceIndex + 1 : sourceIndex;
        const nextSkip = page.nextSkip ?? 0;
        await this.repository.stagePage({
          syncId: lease.syncId, sourceIndex, sourceEntity: source.entity, nextSourceIndex, nextSkip,
          received: page.received, rejected: page.rejected,
          rows: page.items.map((item) => toStageRow(sourceIndex, item)),
        });
        console.info({ event: "partner_document_sync_page_completed", syncId: lease.syncId, sourceEntity: source.entity, sourceIndex, skip, rowsReceived: page.received, rowsStaged: page.items.length, rowsRejected: page.rejected });
        sourceIndex = nextSourceIndex;
        skip = nextSkip;
        pagesProcessed += 1;
      }
      if (sourceIndex < ONE_C_DOCUMENT_SOURCES.length) {
        await this.repository.release(lease.syncId);
        return { syncId: lease.syncId, completed: false, pagesProcessed, publication: null };
      }
      const publication = await this.repository.publish(lease.syncId);
      console.info({ event: "partner_document_sync_completed", syncId: lease.syncId, pagesProcessed, ...publication });
      return { syncId: lease.syncId, completed: true, pagesProcessed, publication };
    } catch (error) {
      const safeErrorCode = classify(error);
      await this.repository.fail(lease.syncId, safeErrorCode);
      console.error({ event: "partner_document_sync_failed", syncId: lease.syncId, sourceIndex, safeErrorCode, errorType: error instanceof Error ? error.name : typeof error });
      throw error;
    }
  }
}

function toStageRow(sourceIndex: number, item: DocumentDTO): DocumentSyncStageRow {
  if (!item.ownerReference) throw new Error("document_counterparty_missing");
  return {
    source_index: sourceIndex, source_entity: item.sourceEntity,
    source_document_ref: item.reference.externalId, document_type: item.documentType,
    title: item.title, document_number: item.documentNumber, document_date: item.documentDate,
    posted: item.posted, deletion_marked: item.deletionMarked,
    counterparty_ref: item.ownerReference.externalId,
    contract_ref: item.contractReference?.externalId ?? null,
    order_ref: item.orderReference?.externalId ?? null,
    base_document_ref: item.baseDocumentReference?.externalId ?? null,
    correction_ref: item.correctionReference?.externalId ?? null,
    currency_ref: item.currencyReference?.externalId ?? null,
    source_version: item.metadata.sourceVersion ?? null,
  };
}
function boundedPages(value: number) { const parsed=Math.trunc(value); return Number.isFinite(parsed)?Math.min(20,Math.max(1,parsed)):20; }
function classify(error: unknown) { const name=error instanceof Error?error.name:"unknown"; return name.replace(/([a-z])([A-Z])/g,"$1_$2").toLowerCase().slice(0,80)||"document_sync_failed"; }
