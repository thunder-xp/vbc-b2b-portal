export const SERVICE_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;
export const SERVICE_ATTACHMENT_MIME = ["image/jpeg","image/png","image/webp","application/pdf"] as const;
export function hasValidFileSignature(bytes: Uint8Array,mime:string):boolean{
  if(mime==="application/pdf")return starts(bytes,[0x25,0x50,0x44,0x46,0x2d]);
  if(mime==="image/png")return starts(bytes,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  if(mime==="image/jpeg")return starts(bytes,[0xff,0xd8,0xff]);
  if(mime==="image/webp")return starts(bytes,[0x52,0x49,0x46,0x46])&&bytes.length>11&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  return false;
}
function starts(bytes:Uint8Array,signature:number[]){return signature.every((value,index)=>bytes[index]===value)}
