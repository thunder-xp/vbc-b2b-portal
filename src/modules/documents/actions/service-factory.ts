import { createPartnerWorkspaceContextService } from "../../partner-cabinet/actions/service-factory";
import { SupabaseDocumentRepository } from "../repositories";
import { DocumentService } from "../services";

export function createDocumentService() { return new DocumentService(new SupabaseDocumentRepository(), createPartnerWorkspaceContextService()); }

