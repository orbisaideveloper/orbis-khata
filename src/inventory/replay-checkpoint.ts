/** Disposable, bounded acceleration only. Original documents remain authoritative.
 * Every reuse compares the exact ordered source prefix; edits invalidate dependents.
 * No checkpoint is persisted or trusted across sessions / policy versions. */
type Checkpoint<T>={offset:number;state:T};
type Replay<T>={source:string[];points:Checkpoint<T>[]};
export class ReplayCheckpoints<T>{
 private readonly contexts=new Map<string,Replay<T>>();
 private readonly clone:(state:T)=>T;
 private readonly interval:number;
 constructor(clone:(state:T)=>T,interval=256){this.clone=clone;this.interval=interval;}
 run(key:string,documents:readonly unknown[],create:()=>T,apply:(state:T,index:number)=>void){
  const source=documents.map(document=>JSON.stringify(document));
  const prior=this.contexts.get(key);let common=0;
  if(prior){while(common<source.length&&source[common]===prior.source[common])common++;}
  const points=(prior?.points??[]).filter(point=>point.offset<=common);
  const last=points.at(-1);const state=last?this.clone(last.state):create();
  for(let index=last?.offset??0;index<source.length;index++){
   apply(state,index);
   if(source.length<=10000&&(index+1)%this.interval===0){points.push({offset:index+1,state:this.clone(state)});if(points.length>3)points.shift();}
  }
  this.retain(key,source,points);
  return state;
 }
 private retain(key:string,source:string[],points:Checkpoint<T>[]){
  if(source.length>10000){this.contexts.delete(key);return;}
  this.contexts.delete(key);this.contexts.set(key,{source,points});
  if(this.contexts.size>2)this.contexts.delete(this.contexts.keys().next().value!);
 }
 clear(){this.contexts.clear();}
}
