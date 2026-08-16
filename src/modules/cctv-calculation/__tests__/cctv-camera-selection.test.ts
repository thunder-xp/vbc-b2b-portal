import { describe, expect, it } from "vitest";
import { selectCctvCameraCandidates, selectEconomyAlternative, type CctvCameraCandidate } from "../cctv-camera-selection";

const base: CctvCameraCandidate = { candidateId:"1",objectType:"warehouse",placement:"outdoor",productId:"b",
  manualPriority:"normal",enabled:true,eligibleForRecommended:true,eligibleForEconomy:true,resolutionMp:4,networkCamera:true,poeSupported:true,colorNight:true,anpr:false,
  videoAnalytics:true,technicalVerified:true,availableStock:50,recentSalesQty:9,lastSaleAt:null,signalUpdatedAt:null };
const input={objectType:"warehouse" as const,colorNight:false,licensePlateRecognition:false,videoAnalytics:false};
const requirement={kind:"outdoor_camera" as const,cameraResolutionMp:4 as const};

describe("CCTV camera selection policy",()=>{
  it("filters by object, placement and technical compatibility before ranking",()=>{
    const candidates=[base,{...base,productId:"cheap-2mp",resolutionMp:2,availableStock:999},{...base,productId:"indoor",placement:"indoor" as const}];
    expect(selectCctvCameraCandidates(input,requirement,candidates).eligible.map((item)=>item.productId)).toEqual(["b"]);
  });
  it("fails closed for missing advanced metadata",()=>{
    expect(selectCctvCameraCandidates({...input,colorNight:true},requirement,[{...base,colorNight:null}]).recommended).toBeNull();
  });
  it("uses manual priority, stock depth, slow sales and a stable identity deterministically",()=>{
    const candidates=[base,{...base,productId:"a",availableStock:100,recentSalesQty:0},{...base,productId:"c",manualPriority:"high" as const}];
    const first=selectCctvCameraCandidates(input,requirement,candidates);
    const second=selectCctvCameraCandidates(input,requirement,[...candidates].reverse());
    expect(first.eligible.map((item)=>item.productId)).toEqual(second.eligible.map((item)=>item.productId));
    expect(first.recommended?.productId).toBe("c");
  });
  it("merges the inherited pool and lets an exact product entry override its inherited duplicate",()=>{
    const fallback={...base,objectType:"other" as const,productId:"fallback"};
    expect(selectCctvCameraCandidates(input,requirement,[fallback]).recommended?.productId).toBe("fallback");
    expect(selectCctvCameraCandidates(input,requirement,[fallback,base]).eligible.map((item)=>item.productId)).toEqual(["b","fallback"]);
    expect(selectCctvCameraCandidates(input,requirement,[fallback,{...base,resolutionMp:2}]).recommended?.productId).toBe("fallback");
    expect(selectCctvCameraCandidates(input,requirement,[{...fallback,productId:"b"},base]).eligible).toHaveLength(1);
  });
  it("selects the cheapest alternative from the same eligible ranking",()=>{
    const ranked=selectCctvCameraCandidates(input,requirement,[base,{...base,productId:"a"},{...base,productId:"c"}]).eligible;
    expect(selectEconomyAlternative(ranked,new Map([["a",80],["b",100],["c",90]]),"b")?.productId).toBe("a");
  });
  it("does not call a more expensive camera an Economy alternative",()=>{
    const ranked=selectCctvCameraCandidates(input,requirement,[base,{...base,productId:"expensive"}]).eligible;
    expect(selectEconomyAlternative(ranked,new Map([["b",100],["expensive",120]]),"b")).toBeNull();
  });
  it("keeps Recommended and Economy eligibility independent",()=>{
    const recommendedOnly={...base,productId:"recommended",eligibleForEconomy:false};
    const economyOnly={...base,productId:"economy",eligibleForRecommended:false};
    const selection=selectCctvCameraCandidates(input,requirement,[recommendedOnly,economyOnly]);
    expect(selection.recommended?.productId).toBe("recommended");
    expect(selection.economyEligible.map((item)=>item.productId)).toEqual(["economy"]);
  });
  it("never chooses a technically incompatible Economy candidate",()=>{
    const ranked=selectCctvCameraCandidates(input,requirement,[base,{...base,productId:"cheap",resolutionMp:2}]);
    expect(selectEconomyAlternative(ranked.economyEligible,new Map([["b",100],["cheap",1]]),null)?.productId).toBe("b");
  });
});
