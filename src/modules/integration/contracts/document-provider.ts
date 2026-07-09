import type {
  DocumentDTO,
  ExternalReferenceDTO,
  IntegrationPageResultDTO,
  IntegrationSyncWindowDTO,
} from "../dto";

export type DocumentFetchRequestDTO = IntegrationSyncWindowDTO & {
  ownerReferences?: ExternalReferenceDTO[];
  documentTypes?: string[];
};

export interface DocumentProvider {
  fetchDocuments(
    input: DocumentFetchRequestDTO,
  ): Promise<IntegrationPageResultDTO<DocumentDTO>>;
}
