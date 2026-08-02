"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCompanyAccessService, getAuthenticatedUserId } from "../access-control/actions/service-factory";
import { failureFromError, invalidInput, success, type ActionResult } from "../access-control/actions/action-result";
import { requireAdminPermission } from "../admin/services";
import { ServiceCenterService } from "./service";
import { SupabaseServiceCenterRepository } from "./supabase.repository";
import { SERVICE_CASE_TYPES, type ServiceCaseCreateInput, type ServiceCaseDetail, type ServiceCasePage } from "./types";

function service(){return new ServiceCenterService(new SupabaseServiceCenterRepository(),createCompanyAccessService());}
export async function listServiceCasesAction(input: {query?:string|null;status?:string|null;page?:string|number|null}={}):Promise<ActionResult<ServiceCasePage>>{try{return success("Заявки загружены.",await service().listPartner(await getAuthenticatedUserId(),input));}catch(error){return failureFromError(error);}}
export async function getServiceCaseAction(id:string):Promise<ActionResult<ServiceCaseDetail|null>>{try{return success("Заявка загружена.",await service().getPartner(await getAuthenticatedUserId(),id));}catch(error){return failureFromError(error);}}
export async function getServiceSelectionsAction(){try{return success("Данные загружены.",await service().selections(await getAuthenticatedUserId()));}catch(error){return failureFromError(error);}}
export async function createServiceCaseAction(_state:ActionResult<null>,formData:FormData):Promise<ActionResult<null>>{
 const input:ServiceCaseCreateInput={caseType:text(formData,"caseType") as ServiceCaseCreateInput["caseType"],productId:nullable(formData,"productId"),orderId:nullable(formData,"orderId"),orderLineId:nullable(formData,"orderLineId"),enteredSerial:text(formData,"enteredSerial"),faultCategory:text(formData,"faultCategory"),description:text(formData,"description"),symptoms:text(formData,"symptoms"),issueStartedOn:nullable(formData,"issueStartedOn"),powersOn:booleanOrNull(formData,"powersOn"),factoryResetAttempted:booleanOrNull(formData,"factoryResetAttempted"),preferredContact:text(formData,"preferredContact"),evidenceConsent:formData.get("evidenceConsent")==="on"};
 if(!SERVICE_CASE_TYPES.includes(input.caseType))return invalidInput("Выберите тип обращения.");
 try{const created=await service().create(await getAuthenticatedUserId(),input);revalidatePath("/cabinet/service");redirect(`/cabinet/service/${created.id}`);}catch(error){return failureFromError(error);}
}
export async function addServiceMessageAction(_state:ActionResult<null>,formData:FormData):Promise<ActionResult<null>>{try{const id=text(formData,"caseId");await service().respond(await getAuthenticatedUserId(),id,text(formData,"message"));revalidatePath(`/cabinet/service/${id}`);return success("Информация отправлена.",null);}catch(error){return failureFromError(error);}}
export async function listAdminServiceCasesAction(input:{query?:string|null;status?:string|null;page?:string|number|null}={}):Promise<ActionResult<ServiceCasePage>>{try{await requireAdminPermission("admin.service.view");return success("Заявки загружены.",await service().listAdmin(input));}catch(error){return failureFromError(error);}}
export async function getAdminServiceCaseAction(id:string):Promise<ActionResult<ServiceCaseDetail|null>>{try{await requireAdminPermission("admin.service.view");return success("Заявка загружена.",await service().getAdmin(id));}catch(error){return failureFromError(error);}}
export async function transitionServiceCaseAction(_state:ActionResult<null>,formData:FormData):Promise<ActionResult<null>>{try{await requireAdminPermission("admin.service.manage");const id=text(formData,"caseId");await service().transition({caseId:id,expectedVersion:Number(text(formData,"expectedVersion")),status:text(formData,"status"),partnerMessage:text(formData,"partnerMessage"),internalNote:text(formData,"internalNote"),assigneeId:nullable(formData,"assigneeId")});revalidatePath(`/admin/service/${id}`);revalidatePath(`/cabinet/service/${id}`);return success("Статус обновлён.",null);}catch(error){return failureFromError(error);}}
function text(data:FormData,key:string){const value=data.get(key);return typeof value==="string"?value.trim():"";}
function nullable(data:FormData,key:string){return text(data,key)||null;}
function booleanOrNull(data:FormData,key:string){const value=text(data,key);return value==="yes"?true:value==="no"?false:null;}
