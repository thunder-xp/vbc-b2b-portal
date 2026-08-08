"use server";

import { failureFromError, success, type ActionResult } from "../access-control/actions/action-result";
import { getAuthenticatedUserId } from "../access-control/actions/service-factory";
import { requireAdminPermission } from "../admin/services";
import { createServiceHistoryService } from "./factory";
import type { OneCServiceHistoryDetail, ServiceHistoryDiagnostics, UnifiedServiceHistoryPage } from "./types";

export async function listUnifiedServiceHistoryAction(input: { query?: string; filter?: string; page?: string | number } = {}): Promise<ActionResult<UnifiedServiceHistoryPage>> {
  try { return success("История сервиса загружена.", await createServiceHistoryService().listPartner(await getAuthenticatedUserId(),input)); } catch(error){ return failureFromError(error); }
}
export async function getOneCServiceHistoryAction(id:string):Promise<ActionResult<OneCServiceHistoryDetail|null>>{
  try{return success("История сервиса загружена.",await createServiceHistoryService().getPartner(await getAuthenticatedUserId(),id));}catch(error){return failureFromError(error);}
}
export async function listAdminOneCServiceHistoryAction(input:{query?:string;status?:string;page?:string|number}={}){
  try{await requireAdminPermission("admin.service.view");return success("История 1С загружена.",await createServiceHistoryService().listAdmin(input));}catch(error){return failureFromError(error);}
}
export async function getAdminOneCServiceHistoryAction(id:string):Promise<ActionResult<OneCServiceHistoryDetail|null>>{
  try{await requireAdminPermission("admin.service.view");return success("История 1С загружена.",await createServiceHistoryService().getAdmin(id));}catch(error){return failureFromError(error);}
}
export async function getOneCServiceHistoryDiagnosticsAction():Promise<ActionResult<ServiceHistoryDiagnostics>>{
  try{await requireAdminPermission("admin.service.view");return success("Диагностика загружена.",await createServiceHistoryService().diagnostics());}catch(error){return failureFromError(error);}
}
