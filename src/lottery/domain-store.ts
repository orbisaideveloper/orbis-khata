import metadata from '../../vendor/foundation-lottery/runtime/model-metadata.ts';
type Row=Record<string,any>;
export type LotteryState=Record<string,Row[]>;
type Field={type:string;nullable:boolean;default?:string};
type Model={fields:Record<string,Field>;unique:string[][];relations:{target:string;fields:string[];references:string[]}[]};
const defer=<T,>(action:()=>T):Promise<T>=>Promise.resolve().then(action);
const models=metadata as Record<string,Model>;
export function encodeLottery(value:any):any{
 if(typeof value==='bigint')return {$lottery:'bigint',value:String(value)};
 if(value instanceof Date)return {$lottery:'date',value:value.toISOString()};
 if(Array.isArray(value))return value.map(encodeLottery);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,encodeLottery(v)]));
 return value;
}
export function decodeLottery(value:any):any{
 if(Array.isArray(value))return value.map(decodeLottery);
 if(value&&typeof value==='object'){
  if(value.$lottery==='bigint')return BigInt(value.value);
  if(value.$lottery==='date')return new Date(value.value);
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,decodeLottery(v)]));
 }
 return value;
}
function equal(a:any,b:any){return a instanceof Date||b instanceof Date?new Date(a).getTime()===new Date(b).getTime():a===b;}
function condition(actual:any,expected:any):boolean{
 if(!expected||typeof expected!=='object'||expected instanceof Date)return equal(actual,expected);
 const checks:Record<string,(v:any)=>boolean>={equals:v=>equal(actual,v),in:v=>v.some((x:any)=>equal(actual,x)),notIn:v=>!v.some((x:any)=>equal(actual,x)),not:v=>!condition(actual,v),gte:v=>actual>=v,gt:v=>actual>v,lte:v=>actual<=v,lt:v=>actual<v};
 return Object.entries(expected).every(([op,v])=>checks[op]?checks[op](v):condition(actual?.[op],v));
}
function matches(row:Row,where:Row={}):boolean{
 return Object.entries(where).every(([key,value])=>{
  if(value===undefined)return true;
  const group=Array.isArray(value)?value:[value];
  if(key==='AND')return group.every(v=>matches(row,v));
  if(key==='OR')return group.some(v=>matches(row,v));
  if(key==='NOT')return !group.some(v=>matches(row,v));
  if(!(key in row)&&key.includes('_'))return matches(row,value);
  return condition(row[key],value);
 });
}
function compare(order:Row|Row[],a:Row,b:Row){
 const fields=(Array.isArray(order)?order:[order]).flatMap(item=>Object.entries(item));
 for(const [key,direction] of fields){
  const sign=direction==='desc'?-1:1;
  if(a[key]<b[key])return -sign;
  if(a[key]>b[key])return sign;
 }
 return 0;
}
function coerce(value:any,field:Field){
 if(value===null||value===undefined)return value;
 if(field.type==='BigInt')return BigInt(value);
 if(field.type==='DateTime')return new Date(value);
 return value;
}
function defaultValue(key:string,field:Field,now:Date){
 const value=field.default;
 if(value==='uuid()')return crypto.randomUUID();
 if(value==='now()'||key==='updatedAt')return now;
 if(value!==undefined)return coerce(JSON.parse(value),field);
 return field.nullable?null:undefined;
}
function defaults(model:Model,data:Row,now:Date){
 const row:Row={};
 for(const [key,field] of Object.entries(model.fields))row[key]=key in data?coerce(data[key],field):defaultValue(key,field,now);
 return {...row,...Object.fromEntries(Object.entries(data).map(([k,v])=>[k,model.fields[k]?coerce(v,model.fields[k]):v]))};
}
function changedValue(previous:any,value:any,field?:Field){
 if(value&&typeof value==='object'&&'increment' in value)return previous+value.increment;
 return field?coerce(value,field):value;
}
function unique(model:Model,rows:Row[],row:Row,except?:Row){
 if(model.unique.some(keys=>keys.every(k=>row[k]!==null&&row[k]!==undefined)&&rows.some(other=>other!==except&&keys.every(k=>equal(other[k],row[k])))))throw Object.assign(new Error('DUPLICATE_LOTTERY_RECORD'),{code:'P2002'});
}
function foreignKeys(model:Model,state:LotteryState,row:Row){
 for(const relation of model.relations){
  if(relation.fields.some(key=>row[key]===null||row[key]===undefined))continue;
  const found=state[relation.target].some(target=>relation.fields.every((key,index)=>equal(row[key],target[relation.references[index]])));
  if(!found)throw new Error('LOTTERY_RELATED_RECORD_NOT_FOUND');
 }
}
/** A private aggregate adapter. The SQL transaction locks the owner before hydration.
 * It cannot issue SQL or access Foundation/Khata tables. Original domain services
 * validate records; this adapter supplies atomic rollback, types and uniqueness.
 */
export function createLotteryStore(initial:LotteryState={},clock=()=>new Date()){
 let state=structuredClone(initial);const client:Row={};
 for(const [name,model] of Object.entries(models)){
  state[name]??=[];
  const rows=()=>state[name];
  const find=({where={},orderBy={},skip=0,take,select}:Row={})=>rows().filter(row=>matches(row,where)).sort((a,b)=>compare(orderBy,a,b)).slice(skip,take===undefined?undefined:skip+take).map(row=>structuredClone(select?Object.fromEntries(Object.keys(select).filter(k=>select[k]).map(k=>[k,row[k]])):row));
  const create=({data}:Row)=>{const row=defaults(model,data,clock());if(row.organizationId&&!state.foundationAccountingOrganization.some(org=>org.id===row.organizationId)){throw new Error('ORGANIZATION_NOT_FOUND');}foreignKeys(model,state,row);unique(model,rows(),row);rows().push(row);return structuredClone(row);};
  const update=({where,data}:Row)=>{
   const row=rows().find(row=>matches(row,where));if(!row){throw new Error('LOTTERY_RECORD_NOT_FOUND');}
   const next={...row};for(const [key,value] of Object.entries(data)){next[key]=changedValue(row[key],value,model.fields[key]);}
   foreignKeys(model,state,next);unique(model,rows(),next,row);Object.assign(row,next);return structuredClone(row);
  };
  client[name]={findMany:(args:Row)=>defer(()=>find(args)),findFirst:(args:Row)=>defer(()=>find(args)[0]??null),findUnique:(args:Row)=>defer(()=>find(args)[0]??null),count:(args:Row)=>defer(()=>find(args).length),create:(args:Row)=>defer(()=>create(args)),update:(args:Row)=>defer(()=>update(args)),
   createMany:({data}:Row)=>defer(()=>{for(const row of data){create({data:row});}return {count:data.length};}),
   updateMany:({where,data}:Row)=>defer(()=>{const found=find({where});for(const row of found){update({where:{id:row.id},data});}return {count:found.length};}),
   upsert:({where,create:data,update:change}:Row)=>defer(()=>find({where}).length?update({where,data:change}):create({data})),
   delete:({where}:Row)=>defer(()=>{const row=rows().find(row=>matches(row,where));if(!row){throw new Error('LOTTERY_RECORD_NOT_FOUND');}state[name]=rows().filter(r=>r!==row);return structuredClone(row);}),
  };
 }
 client.$transaction=async(action:(tx:Row)=>Promise<any>)=>{const previous=structuredClone(state);try{return await action(client);}catch(error){state=previous;throw error;}};
 // Original row-lock calls are satisfied by the enclosing SQL owner lock.
 client.$queryRawUnsafe=(query:string)=>defer(()=>{if(!/^SELECT "id" FROM "Foundation\w+" WHERE .* FOR UPDATE$/u.test(query)){throw new Error('LOTTERY_QUERY_DENIED');}return [];});
 return {client,snapshot:()=>structuredClone(state)};
}
