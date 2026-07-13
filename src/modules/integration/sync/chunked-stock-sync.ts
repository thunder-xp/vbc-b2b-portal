import "server-only";

import { createAdminClient } from "../../../lib/supabase/admin";
import type {
  StockBalanceKind,
  StockBalanceProvider,
  StockStageRow,
  StockWarehouseRow,
  SupplierArrivalProvider,
  SupplierBalanceRow,
  SupplierOrderDocumentRow,
} from "../providers/one-c";

export type StockSyncStatus = "never_run" | "queued" | "running" | "succeeded" | "failed";
export type StockSyncStage = "warehouse_scan" | "physical_scan" | "reserved_scan" | "incoming_scan" | "supplier_arrival_balance" | "supplier_order_documents" | "stock_publication" | "completed";
export type StockSyncState = { status:StockSyncStatus; activeSyncId:string|null; lastFailedSyncId:string|null; snapshotTime:string|null; currentStage:StockSyncStage|null; nextSkip:number; pageSize:number; pagesProcessed:number; physicalRows:number; reservedRows:number; incomingRows:number; warehousesLoaded:number; supplierBalanceRows?:number; supplierBalanceGroups?:number; supplierPositiveGroups?:number; supplierNonpositiveExcluded?:number; supplierOrdersRequested?:number; productsMatched:number; productsUnmatched:number; rowsPublished:number; rowsDeactivated:number; scanComplete:boolean; startedAt:string|null; lastSuccessfulSyncAt:string|null; errorCategory:string|null; failedStage:string|null; safeError:string|null; failedPage:number|null; updatedAt:string };
type CheckpointInput = { stage:StockSyncStage; nextSkip:number; received:number; kind:StockBalanceKind|"warehouses"|"supplier_balance"|"supplier_documents"; complete?:boolean; supplierStats?:{groups:number;positive:number;excluded:number} };

export interface StockSyncStore {
  start():Promise<{state:StockSyncState;started:boolean}>; getState():Promise<StockSyncState>;
  claim(syncId:string,token:string):Promise<boolean>; release(syncId:string,token:string):Promise<void>;
  stageWarehouses(syncId:string,rows:StockWarehouseRow[]):Promise<number>;
  stageBalances(syncId:string,kind:StockBalanceKind,sourcePage:number,rows:StockStageRow[]):Promise<number>;
  stageSupplierBalances(syncId:string,sourcePage:number,rows:SupplierBalanceRow[]):Promise<void>;
  listSupplierOrderRefs(syncId:string,offset:number,limit:number):Promise<string[]>;
  stageSupplierDocuments(syncId:string,rows:SupplierOrderDocumentRow[]):Promise<void>;
  checkpoint(syncId:string,input:CheckpointInput):Promise<void>; publish(syncId:string):Promise<void>;
  fail(syncId:string,stage:StockSyncStage,page:number,error:unknown):Promise<void>; failLaunch(syncId:string,message:string):Promise<void>;
}

const PAGE_SIZE=500, DOCUMENT_BATCH_SIZE=25, MAX_PAGES=5, BUDGET=45_000;

export class ChunkedStockSyncService {
  constructor(private provider:StockBalanceProvider,private supplierProvider:SupplierArrivalProvider,private store:StockSyncStore,private now:()=>number=Date.now){}
  start(){return this.store.start();} getState(){return this.store.getState();} failLaunch(id:string,message:string){return this.store.failLaunch(id,message);}
  async continue(syncId:string){
    let state=await this.store.getState();
    if(state.activeSyncId!==syncId||!["queued","running"].includes(state.status))return{state,pages:0};
    const token=crypto.randomUUID(); if(!await this.store.claim(syncId,token))return{state:await this.store.getState(),pages:0};
    const started=this.now(); let pages=0;
    try{
      while(pages<MAX_PAGES&&this.now()-started<BUDGET){
        state=await this.store.getState(); const stage=state.currentStage;
        if(!stage||stage==="completed"||stage==="stock_publication")break;
        if(stage==="supplier_order_documents"){
          const refs=await this.store.listSupplierOrderRefs(syncId,state.nextSkip,DOCUMENT_BATCH_SIZE);
          const documents=await this.supplierProvider.fetchSupplierOrderDocuments(refs);
          await this.store.stageSupplierDocuments(syncId,documents); pages++;
          const complete=refs.length<DOCUMENT_BATCH_SIZE;
          await this.store.checkpoint(syncId,{stage:complete?"stock_publication":stage,nextSkip:complete?0:state.nextSkip+DOCUMENT_BATCH_SIZE,received:refs.length,kind:"supplier_documents",complete});
          if(complete){await this.store.publish(syncId);return{state:await this.store.getState(),pages};}
          continue;
        }
        if(stage==="supplier_arrival_balance"){
          const page=await this.supplierProvider.fetchSupplierBalances(state.snapshotTime!);
          await this.store.stageSupplierBalances(syncId,0,page.items); pages++;
          await this.store.checkpoint(syncId,{stage:"supplier_order_documents",nextSkip:0,received:page.received,kind:"supplier_balance",supplierStats:{groups:page.groups,positive:page.items.filter(row=>row.remainingQuantity>0).length,excluded:page.excluded}});
          continue;
        }
        const page=stage==="warehouse_scan"?await this.provider.fetchWarehouses(state.nextSkip,state.pageSize):await this.provider.fetchBalances(kindFor(stage),state.snapshotTime!,state.nextSkip,state.pageSize);
        const sourcePage=Math.floor(state.nextSkip/state.pageSize);
        if(stage==="warehouse_scan")await this.store.stageWarehouses(syncId,page.items as StockWarehouseRow[]);
        else await this.store.stageBalances(syncId,kindFor(stage),sourcePage,page.items as StockStageRow[]);
        pages++; const complete=page.rowCount<state.pageSize;
        await this.store.checkpoint(syncId,{stage:complete?nextStage(stage):stage,nextSkip:complete?0:state.nextSkip+state.pageSize,received:page.rowCount,kind:stage==="warehouse_scan"?"warehouses":kindFor(stage)});
      }
      await this.store.release(syncId,token); return{state:await this.store.getState(),pages};
    }catch(error){const current=await this.store.getState();console.error({event:"stock_sync_chunk_failed",stage:current.currentStage,errorType:error instanceof Error?error.name:typeof error,errorCode:readErrorCode(error),statusCode:readDiagnosticNumber(error,"statusCode"),requestKind:readDiagnosticString(error,"requestKind"),resourceName:readDiagnosticString(error,"resourceName")});await this.store.fail(syncId,current.currentStage??"physical_scan",current.pagesProcessed+1,error);return{state:await this.store.getState(),pages};}
  }
}

export class SupabaseStockSyncStore implements StockSyncStore {
  async start(){const current=await this.getState();if(["queued","running"].includes(current.status)&&Date.parse(current.updatedAt)>Date.now()-600_000)return{state:current,started:false};const client=createAdminClient();const{data:price}=await client.from("price_sync_state").select("status").eq("id","product_prices").maybeSingle();if(price?.status==="running"||price?.status==="queued")throw new Error("Price synchronization is active.");await this.clear(current.activeSyncId??current.lastFailedSyncId);const id=crypto.randomUUID(),now=new Date().toISOString();const{error}=await client.from("stock_sync_state").update({status:"queued",active_sync_id:id,last_failed_sync_id:null,snapshot_time:now,current_stage:"warehouse_scan",next_skip:0,page_size:PAGE_SIZE,pages_processed:0,physical_rows:0,reserved_rows:0,incoming_rows:0,warehouses_loaded:0,products_matched:0,products_unmatched:0,rows_published:0,rows_deactivated:0,supplier_balance_rows:0,supplier_balance_groups:0,supplier_positive_groups:0,supplier_nonpositive_excluded:0,supplier_orders_requested:0,supplier_documents_resolved:0,supplier_documents_missing:0,supplier_unposted_excluded:0,supplier_deleted_excluded:0,supplier_closed_excluded:0,supplier_state_excluded:0,supplier_missing_date_excluded:0,supplier_date_placement_excluded:0,supplier_overdue_excluded:0,supplier_valid_arrivals:0,supplier_arrivals_published:0,scan_complete:false,started_at:now,error_category:null,failed_stage:null,safe_error:null,database_error_code:null,failed_page:null,active_chunk_token:null,chunk_started_at:null,updated_at:now}).eq("id","exact_stock");if(error)throw dbError(error);return{state:await this.getState(),started:true};}
  async getState(){const{data,error}=await createAdminClient().from("stock_sync_state").select("*").eq("id","exact_stock").single();if(error||!data)throw dbError(error);return mapState(data);}
  async claim(id:string,token:string){const{data,error}=await createAdminClient().rpc("claim_stock_sync_chunk",{p_sync_id:id,p_token:token});if(error)throw dbError(error);return data===true;}
  async release(id:string,token:string){const{error}=await createAdminClient().from("stock_sync_state").update({active_chunk_token:null,chunk_started_at:null,updated_at:new Date().toISOString()}).eq("id","exact_stock").eq("active_sync_id",id).eq("active_chunk_token",token);if(error)throw dbError(error);}
  async stageWarehouses(id:string,rows:StockWarehouseRow[]){if(!rows.length)return 0;const{error}=await createAdminClient().from("stock_warehouse_sync_stage").upsert(rows.map(r=>({sync_id:id,external_ref:r.externalRef,code:r.code,name:r.name,organization_ref:r.organizationRef,is_active:r.isActive})),{onConflict:"sync_id,external_ref"});if(error)throw dbError(error);return rows.length;}
  async stageBalances(id:string,kind:StockBalanceKind,sourcePage:number,rows:StockStageRow[]){const client=createAdminClient(),payload=rows.map(r=>({external_product_ref:r.externalProductRef,external_warehouse_ref:r.externalWarehouseRef,external_characteristic_ref:r.externalCharacteristicRef,quantity:r.quantity}));let{data,error}=await client.rpc("stage_stock_balance_rows",{p_sync_id:id,p_kind:kind,p_source_page:sourcePage,p_rows:payload});if(error?.code==="PGRST202")({data,error}=await client.rpc("stage_stock_balance_rows",{p_sync_id:id,p_kind:kind,p_rows:payload}));if(error)throw dbError(error);return Number(data??0);}
  async stageSupplierBalances(id:string,sourcePage:number,rows:SupplierBalanceRow[]){const{error}=await createAdminClient().rpc("stage_supplier_arrival_balance_rows",{p_sync_id:id,p_source_page:sourcePage,p_rows:rows.map(r=>({external_supplier_order_ref:r.externalSupplierOrderRef,external_product_ref:r.externalProductRef,external_characteristic_ref:r.externalCharacteristicRef,remaining_quantity:r.remainingQuantity}))});if(error)throw dbError(error);}
  async listSupplierOrderRefs(id:string,offset:number,limit:number){const{data,error}=await createAdminClient().rpc("list_supplier_order_refs",{p_sync_id:id,p_offset:offset,p_limit:limit});if(error)throw dbError(error);return(data??[]).map((row:{external_supplier_order_ref:string})=>row.external_supplier_order_ref);}
  async stageSupplierDocuments(id:string,rows:SupplierOrderDocumentRow[]){if(!rows.length)return;const{error}=await createAdminClient().from("supplier_order_document_stage").upsert(rows.map(r=>({sync_id:id,external_supplier_order_ref:r.externalSupplierOrderRef,is_posted:r.isPosted,is_deleted:r.isDeleted,is_closed:r.isClosed,external_state_ref:r.externalStateRef,expected_arrival_date:r.expectedArrivalDate,date_placement:r.datePlacement,source_version:r.sourceVersion})),{onConflict:"sync_id,external_supplier_order_ref"});if(error)throw dbError(error);}
  async checkpoint(id:string,input:CheckpointInput){const state=await this.getState();const payload:Record<string,unknown>={status:"running",current_stage:input.stage,next_skip:input.nextSkip,pages_processed:state.pagesProcessed+1,scan_complete:input.complete??state.scanComplete,updated_at:new Date().toISOString()};const key=input.kind==="warehouses"?"warehouses_loaded":input.kind==="supplier_balance"?"supplier_balance_rows":input.kind==="supplier_documents"?"supplier_orders_requested":`${input.kind}_rows`;payload[key]=numericState(state,key)+input.received;if(input.supplierStats){payload.supplier_balance_groups=(state.supplierBalanceGroups??0)+input.supplierStats.groups;payload.supplier_positive_groups=(state.supplierPositiveGroups??0)+input.supplierStats.positive;payload.supplier_nonpositive_excluded=(state.supplierNonpositiveExcluded??0)+input.supplierStats.excluded;}const{error}=await createAdminClient().from("stock_sync_state").update(payload).eq("id","exact_stock").eq("active_sync_id",id);if(error)throw dbError(error);}
  async publish(id:string){const{error}=await createAdminClient().rpc("publish_exact_stock_snapshot",{p_sync_id:id});if(error)throw dbError(error);}
  async fail(id:string,stage:StockSyncStage,page:number,error:unknown){const e=error as{code?:string};await createAdminClient().from("stock_sync_state").update({status:"failed",last_failed_sync_id:id,active_sync_id:null,failed_stage:stage,failed_page:page,error_category:"stock_sync_failure",database_error_code:e?.code??null,safe_error:"Exact stock synchronization failed.",active_chunk_token:null,chunk_started_at:null,updated_at:new Date().toISOString()}).eq("id","exact_stock").eq("active_sync_id",id);}
  async failLaunch(id:string,message:string){await createAdminClient().from("stock_sync_state").update({status:"failed",last_failed_sync_id:id,active_sync_id:null,failed_stage:"continuation_launch",error_category:"orchestration_failure",safe_error:message,updated_at:new Date().toISOString()}).eq("id","exact_stock").eq("active_sync_id",id);}
  private async clear(id:string|null){if(!id)return;const client=createAdminClient();await Promise.all(["stock_balance_sync_stage","stock_balance_stage_receipts","stock_warehouse_sync_stage","supplier_arrival_balance_stage","supplier_order_document_stage"].map(table=>client.from(table).delete().eq("sync_id",id)));}
}

function nextStage(stage:StockSyncStage):StockSyncStage{return stage==="warehouse_scan"?"physical_scan":stage==="physical_scan"?"reserved_scan":stage==="reserved_scan"?"incoming_scan":stage==="incoming_scan"?"supplier_arrival_balance":stage;}
function kindFor(stage:StockSyncStage):StockBalanceKind{return stage==="physical_scan"?"physical":stage==="reserved_scan"?"reserved":"incoming";}
function dbError(error:unknown){const code=typeof error==="object"&&error&&"code" in error?String(error.code):undefined;return Object.assign(new Error("Stock persistence failed."),{code});}
function mapState(r:Record<string,unknown>):StockSyncState{return{status:r.status as StockSyncStatus,activeSyncId:str(r.active_sync_id),lastFailedSyncId:str(r.last_failed_sync_id),snapshotTime:str(r.snapshot_time),currentStage:r.current_stage as StockSyncStage|null,nextSkip:num(r.next_skip),pageSize:num(r.page_size),pagesProcessed:num(r.pages_processed),physicalRows:num(r.physical_rows),reservedRows:num(r.reserved_rows),incomingRows:num(r.incoming_rows),warehousesLoaded:num(r.warehouses_loaded),supplierBalanceRows:num(r.supplier_balance_rows),supplierBalanceGroups:num(r.supplier_balance_groups),supplierPositiveGroups:num(r.supplier_positive_groups),supplierNonpositiveExcluded:num(r.supplier_nonpositive_excluded),supplierOrdersRequested:num(r.supplier_orders_requested),productsMatched:num(r.products_matched),productsUnmatched:num(r.products_unmatched),rowsPublished:num(r.rows_published),rowsDeactivated:num(r.rows_deactivated),scanComplete:r.scan_complete===true,startedAt:str(r.started_at),lastSuccessfulSyncAt:str(r.last_successful_sync_at),errorCategory:str(r.error_category),failedStage:str(r.failed_stage),safeError:str(r.safe_error),failedPage:typeof r.failed_page==="number"?r.failed_page:null,updatedAt:String(r.updated_at)}};
function numericState(state:StockSyncState,key:string){if(key==="warehouses_loaded")return state.warehousesLoaded;if(key==="physical_rows")return state.physicalRows;if(key==="reserved_rows")return state.reservedRows;if(key==="incoming_rows")return state.incomingRows;if(key==="supplier_balance_rows")return state.supplierBalanceRows??0;if(key==="supplier_orders_requested")return state.supplierOrdersRequested??0;return 0;}
function str(value:unknown){return typeof value==="string"?value:null;} function num(value:unknown){return typeof value==="number"?value:0;}
function readErrorCode(error:unknown){return typeof error==="object"&&error&&"code" in error?String(error.code):null;}
function readDiagnosticString(error:unknown,key:string){if(typeof error!=="object"||!error||!("diagnostic" in error)||typeof error.diagnostic!=="object"||!error.diagnostic)return null;const value=(error.diagnostic as Record<string,unknown>)[key];return typeof value==="string"?value:null;}
function readDiagnosticNumber(error:unknown,key:string){if(typeof error!=="object"||!error||!("diagnostic" in error)||typeof error.diagnostic!=="object"||!error.diagnostic)return null;const value=(error.diagnostic as Record<string,unknown>)[key];return typeof value==="number"?value:null;}
