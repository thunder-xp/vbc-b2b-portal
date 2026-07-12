import { IntegrationValidationError } from "../../errors";
import { parseOneCGuid, parseRequiredOneCGuid } from "./one-c-guid";
import { OneCODataClient } from "./one-c-odata-client";

const PHYSICAL = "AccumulationRegister_\u0417\u0430\u043f\u0430\u0441\u044b\u041d\u0430\u0421\u043a\u043b\u0430\u0434\u0430\u0445";
const RESERVED = "AccumulationRegister_\u0417\u0430\u043f\u0430\u0441\u044b\u041a\u0420\u0430\u0441\u0445\u043e\u0434\u0443\u0421\u043e\u0421\u043a\u043b\u0430\u0434\u043e\u0432";
const INCOMING = "AccumulationRegister_\u0417\u0430\u043f\u0430\u0441\u044b\u041a\u041f\u043e\u0441\u0442\u0443\u043f\u043b\u0435\u043d\u0438\u044e\u041d\u0430\u0421\u043a\u043b\u0430\u0434\u044b";
const WAREHOUSES = "Catalog_\u0421\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u043d\u044b\u0435\u0415\u0434\u0438\u043d\u0438\u0446\u044b";
const BALANCE_SELECT = ["\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u0430_Key", "\u0425\u0430\u0440\u0430\u043a\u0442\u0435\u0440\u0438\u0441\u0442\u0438\u043a\u0430_Key", "\u0421\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u043d\u0430\u044f\u0415\u0434\u0438\u043d\u0438\u0446\u0430_Key", "\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043eBalance"].join(",");
const WAREHOUSE_SELECT = ["Ref_Key","Code","Description","DeletionMark","\u0422\u0438\u043f\u0421\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u043d\u043e\u0439\u0415\u0434\u0438\u043d\u0438\u0446\u044b","\u041d\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043b\u0435\u043d","\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f_Key"].join(",");

export type StockBalanceKind = "physical" | "reserved" | "incoming";
export type StockStageRow = { externalProductRef: string; externalWarehouseRef: string; externalCharacteristicRef: string; quantity: number };
export type StockWarehouseRow = { externalRef: string; code: string; name: string; organizationRef: string | null; isActive: boolean };
export type StockPage<T> = { items: T[]; rowCount: number };
export interface StockBalanceProvider { fetchWarehouses(skip:number,limit:number):Promise<StockPage<StockWarehouseRow>>; fetchBalances(kind:StockBalanceKind,snapshotTime:string,skip:number,limit:number):Promise<StockPage<StockStageRow>>; }

export class OneCStockBalanceProvider implements StockBalanceProvider {
  private readonly client: OneCODataClient;
  constructor(config:{baseUrl:string|null;username:string|null;password:string|null;requestTimeoutMs:number}) { this.client=new OneCODataClient(config); }
  async fetchWarehouses(skip:number,limit:number) { const payload=await this.collection(WAREHOUSES,{"$select":WAREHOUSE_SELECT,"$top":String(limit),"$skip":String(skip)}); return {rowCount:payload.length,items:payload.flatMap(mapWarehouse)}; }
  async fetchBalances(kind:StockBalanceKind,snapshotTime:string,skip:number,limit:number) { const resource=`${resourceFor(kind)}/Balance(Condition='',Dimensions='',Period=datetime'${odataDate(snapshotTime)}')`; const payload=await this.collection(resource,{"$select":BALANCE_SELECT,"$top":String(limit),"$skip":String(skip)}); return {rowCount:payload.length,items:aggregateStockRows(payload.flatMap(mapBalance))}; }
  private async collection(resource:string,params:Record<string,string>):Promise<unknown[]> { const payload=await this.client.get(resource,params,{requestKind:"stock_balance_scan"}); if(!record(payload)||!Array.isArray(payload.value)) throw new IntegrationValidationError("1C stock Balance response is invalid."); return payload.value; }
}
function mapWarehouse(value:unknown):StockWarehouseRow[] { if(!record(value)||value.DeletionMark===true||value["\u041d\u0435\u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0442\u0435\u043b\u0435\u043d"]===true||text(value["\u0422\u0438\u043f\u0421\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u043d\u043e\u0439\u0415\u0434\u0438\u043d\u0438\u0446\u044b"])!=="\u0421\u043a\u043b\u0430\u0434") return []; const externalRef=parseRequiredOneCGuid(value.Ref_Key); const name=text(value.Description); return externalRef&&name?[{externalRef,code:text(value.Code),name,organizationRef:parseRequiredOneCGuid(value["\u041e\u0440\u0433\u0430\u043d\u0438\u0437\u0430\u0446\u0438\u044f_Key"]),isActive:true}]:[]; }
function mapBalance(value:unknown):StockStageRow[] { if(!record(value)) return []; const externalProductRef=parseRequiredOneCGuid(value["\u041d\u043e\u043c\u0435\u043d\u043a\u043b\u0430\u0442\u0443\u0440\u0430_Key"]); const externalWarehouseRef=parseRequiredOneCGuid(value["\u0421\u0442\u0440\u0443\u043a\u0442\u0443\u0440\u043d\u0430\u044f\u0415\u0434\u0438\u043d\u0438\u0446\u0430_Key"]); const externalCharacteristicRef=parseOneCGuid(value["\u0425\u0430\u0440\u0430\u043a\u0442\u0435\u0440\u0438\u0441\u0442\u0438\u043a\u0430_Key"]); const quantity=value["\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043eBalance"]; return externalProductRef&&externalWarehouseRef&&externalCharacteristicRef&&typeof quantity==="number"?[{externalProductRef,externalWarehouseRef,externalCharacteristicRef,quantity}]:[]; }
export function aggregateStockRows(rows:StockStageRow[]):StockStageRow[] { const totals=new Map<string,StockStageRow>(); for(const row of rows){const key=`${row.externalProductRef}:${row.externalWarehouseRef}:${row.externalCharacteristicRef}`;const current=totals.get(key);totals.set(key,current?{...current,quantity:current.quantity+row.quantity}:{...row});} return [...totals.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,row])=>row); }
function resourceFor(kind:StockBalanceKind){return kind==="physical"?PHYSICAL:kind==="reserved"?RESERVED:INCOMING;}
function odataDate(value:string){return new Date(value).toISOString().replace(/\.\d{3}Z$/,"Z").replace(/Z$/,'');}
function record(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null;}
function text(value:unknown){return typeof value==="string"?value.trim():"";}
export const ONE_C_STOCK_BALANCE_RESOURCES={physical:PHYSICAL,reserved:RESERVED,incoming:INCOMING,warehouses:WAREHOUSES};
