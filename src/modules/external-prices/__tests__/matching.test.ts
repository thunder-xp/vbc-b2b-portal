import { describe,expect,it } from "vitest";
import { matchExternalPriceRows } from "../matching";
import type { CatalogMatchCandidate,ParsedExternalPriceRow } from "../types";

const candidates:CatalogMatchCandidate[]=[
  {id:"1",sku:"100",name:"DH-IPC-HFW1430DT-STW",normalizedModel:"DH-IPC-HFW1430DT-STW",aliases:[]},
  {id:"2",sku:"101",name:"DH-IPC-HDW1230T-S5",normalizedModel:"DH-IPC-HDW1230T-S5",aliases:["DH-IPC-HDW1230T"]},
  {id:"3",sku:"102",name:"DH-IPC-HFW1430DT-STW-S2",normalizedModel:"DH-IPC-HFW1430DT-STW-S2",aliases:[]},
];
describe("external price deterministic matching",()=>{
  it("matches exact canonical model",()=>expect(matchExternalPriceRows([row("DH-IPC-HFW1430DT-STW")],candidates)[0]).toMatchObject({catalogProductId:"1",matchStatus:"matched",matchMethod:"exact_model"}));
  it("matches only governed aliases",()=>expect(matchExternalPriceRows([row("DH-IPC-HDW1230T")],candidates)[0]).toMatchObject({catalogProductId:"2",matchStatus:"matched_alias",matchMethod:"known_alias"}));
  it("requires review for ambiguous prefix candidates",()=>expect(matchExternalPriceRows([row("DH-IPC-HFW1430DT")],candidates)[0]).toMatchObject({catalogProductId:null,matchStatus:"needs_review"}));
  it("leaves unknown models unmatched",()=>expect(matchExternalPriceRows([row("DH-SD9999-UNKNOWN")],candidates)[0]).toMatchObject({catalogProductId:null,matchStatus:"unmatched"}));
});
function row(model:string):ParsedExternalPriceRow{return{sheet:"Sheet",row:1,sourceCode:null,sourceName:model,normalizedModel:model,description:null,partnerPrice:10,retailPrice:null,marker:null};}
