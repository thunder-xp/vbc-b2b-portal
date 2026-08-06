import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({afterCallbacks:[] as Array<()=>Promise<void>>,getState:vi.fn(),continueSync:vi.fn()}));
vi.mock("next/server",()=>({after:(callback:()=>Promise<void>)=>mocks.afterCallbacks.push(callback),NextResponse:{json:(body:unknown,init?:ResponseInit)=>Response.json(body,init)}}));
vi.mock("@/src/lib/env",()=>({getOneCEnv:()=>({})}));
vi.mock("@/src/modules/integration/services",()=>({createChunkedStockSyncService:()=>({getState:mocks.getState,continue:mocks.continueSync})}));

import { POST } from "../stock-sync/route";

describe("internal stock worker route",()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.afterCallbacks.length=0;vi.stubEnv("STOCK_SYNC_SECRET","secret");mocks.getState.mockResolvedValue({activeSyncId:"22222222-2222-4222-8222-222222222222"});mocks.continueSync.mockResolvedValue({pages:2,state:{status:"running",currentStage:"physical_scan"}});});
  it("continues the accepted sync after responding",async()=>{const response=await POST(request("secret"));expect(response.status).toBe(202);expect(mocks.continueSync).not.toHaveBeenCalled();expect(mocks.afterCallbacks).toHaveLength(1);await mocks.afterCallbacks[0]!();expect(mocks.continueSync).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222");});
  it("rejects unauthorized requests without scheduling work",async()=>{expect((await POST(request("wrong"))).status).toBe(401);expect(mocks.afterCallbacks).toHaveLength(0);});
});

function request(secret:string){return new Request("https://portal.example/api/internal/stock-sync",{method:"POST",headers:{authorization:`Bearer ${secret}`,"content-type":"application/json"},body:JSON.stringify({syncId:"22222222-2222-4222-8222-222222222222"})});}
