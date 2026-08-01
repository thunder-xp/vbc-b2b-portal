import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/src/lib/supabase/admin";
import { getAuthenticatedUserId } from "@/src/modules/access-control/actions/service-factory";
import { createDocumentService } from "@/src/modules/documents/actions/service-factory";

export async function GET(_request:Request,{params}:{params:Promise<{documentId:string}>}){const correlationId=randomUUID();let userId:string|undefined;let documentId:string|undefined;try{userId=await getAuthenticatedUserId();documentId=(await params).documentId;const service=createDocumentService();const descriptor=await service.authorizeDownload(userId,documentId,correlationId);
  if(descriptor.retrievalMode==="external_public"&&descriptor.externalUrl){const target=safePublicUrl(descriptor.externalUrl);await service.recordDownload(userId,documentId,correlationId,true);return NextResponse.redirect(target,307)}
  if(descriptor.retrievalMode!=="private_storage"||!descriptor.storageBucket||!descriptor.storageKey)throw new Error("DOCUMENT_FILE_UNAVAILABLE");
  const {data,error}=await createAdminClient().storage.from(descriptor.storageBucket).download(descriptor.storageKey);if(error||!data)throw new Error("DOCUMENT_STORAGE_DOWNLOAD_FAILED");const bytes=await data.arrayBuffer();await service.recordDownload(userId,documentId,correlationId,true);return new NextResponse(bytes,{headers:{"Content-Type":descriptor.mimeType??"application/octet-stream","Content-Length":String(bytes.byteLength),"Content-Disposition":contentDisposition(descriptor.fileName??"document.pdf"),"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}})
}catch(error){if(userId&&documentId){try{await createDocumentService().recordDownload(userId,documentId,correlationId,false,error instanceof Error?error.message:"DOCUMENT_DOWNLOAD_FAILED")}catch{/* Audit failure must not leak or mask the safe response. */}}console.error({event:"partner_document_download_failed",correlationId,errorType:error instanceof Error?error.name:typeof error});return NextResponse.json({message:`Файл пока недоступен. Код: ${correlationId}.`},{status:404,headers:{"Cache-Control":"private, no-store"}})}}
function safePublicUrl(value:string){const url=new URL(value);if(!["https:","http:"].includes(url.protocol)||url.username||url.password||url.hostname==="localhost"||url.hostname.endsWith(".local")||privateIp(url.hostname))throw new Error("DOCUMENT_EXTERNAL_URL_REJECTED");return url}
function privateIp(host:string){if(!isIP(host))return false;return /^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1$|fc|fd)/i.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host)}
function contentDisposition(fileName:string){const safe=fileName.replace(/[^\x20-\x7E]/g,"_").replace(/["\\]/g,"_");return `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(fileName)}`}
