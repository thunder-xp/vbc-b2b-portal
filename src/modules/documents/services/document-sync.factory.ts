import { getOneCEnv } from "@/src/lib/env";
import { OneCDocumentODataProvider } from "../../integration/providers/one-c";
import { SupabaseDocumentSyncRepository } from "../repositories/document-sync.repository";
import { DocumentMetadataSyncService } from "./document-metadata-sync.service";

export function createDocumentMetadataSyncService() {
  const environment = getOneCEnv();
  return new DocumentMetadataSyncService(new SupabaseDocumentSyncRepository(), new OneCDocumentODataProvider(environment));
}
