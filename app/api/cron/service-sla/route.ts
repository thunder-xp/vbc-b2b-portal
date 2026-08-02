import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/src/lib/cron-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime="nodejs";
export const maxDuration=60;
export async function GET(request:Request){const started=performance.now();if(!(await authorizeCronRequest(request)).authorized)return NextResponse.json({error:"Unauthorized"},{status:401});try{const{data,error}=await createAdminClient().rpc("run_service_sla_worker",{p_batch_size:100});if(error)throw error;console.info({event:"service_sla_worker_completed",status:data?.status,casesClaimed:data?.casesClaimed,overdueTransitions:data?.overdueTransitions,notificationsCreated:data?.notificationsCreated,durationMs:Math.round(performance.now()-started),deployedCommitSha:process.env.VERCEL_GIT_COMMIT_SHA?.trim()||"local"});return NextResponse.json(data,{status:data?.status==="locked"?202:200,headers:{"Cache-Control":"no-store"}})}catch(error){console.error({event:"service_sla_worker_failed",errorCode:error instanceof Error?error.name:typeof error,durationMs:Math.round(performance.now()-started),deployedCommitSha:process.env.VERCEL_GIT_COMMIT_SHA?.trim()||"local"});return NextResponse.json({status:"failed"},{status:500,headers:{"Cache-Control":"no-store"}})}}
