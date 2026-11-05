export type AdmissionDecision = Readonly<{allowed:boolean;retryAfter:number}>;
export class GatewayRejection extends Error {
 readonly status:number;readonly code:string;readonly retryAfter?:number;
 constructor(status:number,code:string,retryAfter?:number){super(code);this.name='GatewayRejection';this.status=status;this.code=code;this.retryAfter=retryAfter;}
}
/** Limits expensive authentication/body work per isolate; identity quotas are shared in PostgreSQL. */
export function createIngressGuard(maximum=24){
 if(!Number.isSafeInteger(maximum)||maximum<1){throw new Error('INVALID_INGRESS_LIMIT');}
 let active=0;
 return ()=>{
  if(active>=maximum){throw new GatewayRejection(503,'KHATA_BUSY',1);}
  active++;
  let released=false;
  return ()=>{if(!released){released=true;active--;}};
 };
}
/** Preserve the existing 16K character envelope while bounding UTF-8 bytes and read time. */
export async function boundedGatewayBody(request:Request,timeoutMs=5000):Promise<string>{
 const reader=request.body?.getReader();
 if(!reader){return '';}
 const chunks:Uint8Array[]=[];let size=0,timer:ReturnType<typeof setTimeout>|undefined;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{
  reject(new GatewayRejection(408,'KHATA_BODY_TIMEOUT',1));
  void reader.cancel().catch(()=>{});
 },timeoutMs);});
 try{
  while(true){
   const {done,value}=await Promise.race([reader.read(),deadline]);
   if(done){break;}
   size+=value.byteLength;
   if(size>65536){throw new GatewayRejection(413,'KHATA_INPUT_TOO_LARGE');}
   chunks.push(value);
  }
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  const text=new TextDecoder().decode(bytes);
  if(text.length>16384){throw new GatewayRejection(413,'KHATA_INPUT_TOO_LARGE');}
  return text;
 }catch(error){void reader.cancel().catch(()=>{});throw error;}
 finally{if(timer!==undefined){clearTimeout(timer);}reader.releaseLock();}
}
