type PartyIdentity={id:string;company?:string;name:string;phone:string};
const normalizedPartyName=(value:string)=>value.normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase();
function normalizedPartyPhone(value:string){
 const digits=value.normalize('NFKC').replace(/\D/gu,'');
 if(digits.length===12&&digits.startsWith('91'))return digits.slice(2);
 if(digits.length===11&&digits.startsWith('0'))return digits.slice(1);
 return digits;
}
export function partyMatches(parties:PartyIdentity[],candidate:PartyIdentity){
 const name=normalizedPartyName(candidate.name),phone=normalizedPartyPhone(candidate.phone);
 return parties.filter(p=>p.id!==candidate.id&&(!p.company||p.company===candidate.company)&&(
  Boolean(name)&&normalizedPartyName(p.name)===name||Boolean(phone)&&normalizedPartyPhone(p.phone)===phone));
}
export function identicalParty(parties:PartyIdentity[],candidate:PartyIdentity){
 return partyMatches(parties,candidate).some(p=>normalizedPartyName(p.name)===normalizedPartyName(candidate.name)&&normalizedPartyPhone(p.phone)===normalizedPartyPhone(candidate.phone));
}

/** One pass for the list; avoid a full duplicate scan for every rendered party. */
export function duplicatePartyIds(parties:PartyIdentity[]){
 const groups=new Map<string,string[]>(),duplicates=new Set<string>();
 for(const party of parties){
  for(const [type,value] of [['name',normalizedPartyName(party.name)],['phone',normalizedPartyPhone(party.phone)]]){
   if(!value)continue;
   const key=JSON.stringify([party.company,type,value]),ids=groups.get(key)??[];
   ids.push(party.id);groups.set(key,ids);
   if(ids.length>1){duplicates.add(ids[0]);duplicates.add(party.id);}
  }
 }
 return duplicates;
}
