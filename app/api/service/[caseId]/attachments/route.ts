import { createHash,randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { createClient } from "@/src/lib/supabase/server";
import { hasValidFileSignature,SERVICE_ATTACHMENT_MAX_BYTES,SERVICE_ATTACHMENT_MIME } from "@/src/modules/service-center/attachment-policy";

export async function POST(request:Request,{params}:{params:Promise<{caseId:string}>}){
 const{caseId}=await params;if(!/^[0-9a-f-]{36}$/i.test(caseId))return NextResponse.json({message:"Некорректная заявка."},{status:400});
 const client=await createClient();const{data:{user}}=await client.auth.getUser();if(!user)return NextResponse.json({message:"Требуется вход."},{status:401});
 const{data:detail,error:accessError}=await client.rpc("get_service_case",{p_case_id:caseId});if(accessError||!detail)return NextResponse.json({message:"Заявка недоступна."},{status:404});
 const form=await request.formData();const file=form.get("file");if(!(file instanceof File))return NextResponse.json({message:"Выберите файл."},{status:400});
 if(file.size<1||file.size>SERVICE_ATTACHMENT_MAX_BYTES||!SERVICE_ATTACHMENT_MIME.includes(file.type as never))return NextResponse.json({message:"Допустимы JPG, PNG, WEBP или PDF до 15 МБ."},{status:400});
 const bytes=new Uint8Array(await file.arrayBuffer());if(!hasValidFileSignature(bytes,file.type))return NextResponse.json({message:"Содержимое файла не соответствует формату."},{status:400});
 const safeName=file.name.replace(/[^a-zA-Z0-9._-]+/g,"-").slice(-120)||"evidence";const key=`${caseId}/${randomUUID()}-${safeName}`;const checksum=createHash("sha256").update(bytes).digest("hex");const admin=createAdminClient();
 const{error:uploadError}=await admin.storage.from("service-evidence").upload(key,bytes,{contentType:file.type,upsert:false});if(uploadError)return NextResponse.json({message:"Не удалось загрузить файл."},{status:503});
 const{data:attachment,error:insertError}=await admin.from("service_case_attachments").insert({case_id:caseId,uploaded_by_user_id:user.id,file_name:file.name.slice(0,240),mime_type:file.type,file_size:file.size,checksum_sha256:checksum,storage_key:key}).select("id").single();
 if(insertError){await admin.storage.from("service-evidence").remove([key]);return NextResponse.json({message:"Не удалось сохранить файл."},{status:503});}
 await admin.from("service_case_events").insert({case_id:caseId,actor_user_id:user.id,event_type:"evidence_uploaded",partner_visible:true,message:"Добавлен файл.",safe_metadata:{attachmentId:attachment.id}});
 return NextResponse.json({id:attachment.id,fileName:file.name},{status:201});
}
