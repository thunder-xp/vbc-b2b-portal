import { afterEach, describe, expect, it, vi } from "vitest";
import { aggregateSupplierBalances, OneCSupplierArrivalProvider, SUPPLIER_SHIPMENT_STATE_REF } from "../one-c-supplier-arrival-provider";

const order="11111111-1111-4111-8111-111111111111",product="22222222-2222-4222-8222-222222222222",zero="00000000-0000-0000-0000-000000000000";
describe("OneCSupplierArrivalProvider",()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it("aggregates signed balances before filtering",()=>{expect(aggregateSupplierBalances([row(8),row(-3),row(-5)])).toEqual([{...row(0),remainingQuantity:0}]);});
  it("keeps only positive aggregated supplier groups",async()=>{vi.stubGlobal("fetch",vi.fn(async()=>json({value:[rawBalance(8),rawBalance(-3),{...rawBalance(-5),ЗаказПоставщику_Key:"33333333-3333-4333-8333-333333333333"}]})));const result=await provider().fetchSupplierBalances("2026-07-12T00:00:00Z",0,500);expect(result.items).toEqual([{...row(5),remainingQuantity:5}]);expect(result.excluded).toBe(1);});
  it("maps only confirmed document fields through direct lookup",async()=>{vi.stubGlobal("fetch",vi.fn(async()=>json({Ref_Key:order,DataVersion:"v1",Posted:true,DeletionMark:false,УдалитьЗакрыт:false,СостояниеЗаказа_Key:SUPPLIER_SHIPMENT_STATE_REF,ДатаПоступления:"2026-08-01T00:00:00",ПоложениеДатыПоступления:"ВШапке"})));const [document]=await provider().fetchSupplierOrderDocuments([order]);expect(document).toMatchObject({externalSupplierOrderRef:order,isPosted:true,isDeleted:false,isClosed:false,externalStateRef:SUPPLIER_SHIPMENT_STATE_REF,expectedArrivalDate:"2026-08-01",datePlacement:"ВШапке"});});
});
function row(remainingQuantity:number){return{externalSupplierOrderRef:order,externalProductRef:product,externalCharacteristicRef:zero,remainingQuantity};}
function rawBalance(quantity:number){return{ЗаказПоставщику_Key:order,Номенклатура_Key:product,Характеристика_Key:zero,КоличествоBalance:quantity};}
function provider(){return new OneCSupplierArrivalProvider({baseUrl:"https://erp.example/odata",username:"u",password:"p",requestTimeoutMs:1000});}
function json(value:unknown){return new Response(JSON.stringify(value),{headers:{"content-type":"application/json"}});}
