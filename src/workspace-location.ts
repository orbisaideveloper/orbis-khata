import type {View} from './navigation-policy';
const savedView=(view:unknown):View=>view==='lottery'||view==='khata'?view:'workspace';
const key=(user:string)=>'orbis.khata.location.v1:'+user;
export function readLocation(user?:string|null):{view:View;company:string}{
 try{const value=JSON.parse(user?localStorage.getItem(key(user))??'{}':'{}');return {view:savedView(value.view),company:typeof value.company==='string'?value.company:''};}catch{return {view:'workspace',company:''};}
}
export function saveLocation(user:string|undefined,patch:{view?:View;company?:string}){
 if(!user){return;}try{localStorage.setItem(key(user),JSON.stringify({...readLocation(user),...patch}));}catch{/* Navigation still works when device storage is unavailable. */}
}
export function clearLocation(user?:string|null){if(user){try{localStorage.removeItem(key(user));}catch{/* Logout must remain available. */}}}
