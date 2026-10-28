import { object, workspaceInput } from './workspace-contract';
const key=(user:string,company:string)=>'khata-workspace-pending:'+user+':'+company;
export function readWorkspacePending(user:string,company:string):Record<string,unknown>|null {try{const raw=sessionStorage.getItem(key(user,company));if(!raw||raw.length>196608)return null;const value:unknown=JSON.parse(raw);return object(value)&&value.company===company&&workspaceInput(value)?value:null;}catch{return null;}}
export function saveWorkspacePending(user:string,company:string,input:Record<string,unknown>){if(input.company!==company||!workspaceInput(input))throw new Error('INVALID_PENDING');sessionStorage.setItem(key(user,company),JSON.stringify(input));}
export function clearWorkspacePending(user:string,company:string){sessionStorage.removeItem(key(user,company));}
