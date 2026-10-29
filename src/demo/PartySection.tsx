import {useState} from 'react';
import type {Language} from '../i18n';
import type {Report} from '../accounting/model';
import {LedgerExplorer} from '../accounting/LedgerExplorer';
import {PartyMaster} from './Masters';
import type {DemoParty} from './master-model';
export function PartySection({company,language,parties,report,from,to,version,onChanged}:Readonly<{company:string;language:Language;parties:DemoParty[];report:Report|null;from:string;to:string;version:number;onChanged:()=>void}>){
 const [selected,setSelected]=useState<DemoParty|null>(null);
 if(!selected||!report)return <PartyMaster language={language} company={company} parties={parties} onChanged={onChanged} onSelect={setSelected}/>;
 const expense=selected.kind==='expense';
 return <><p className="party-contact">{selected.name} · {selected.phone} · {selected.address} · {selected.email}</p><LedgerExplorer initialSelection={{id:selected.id,name:selected.name,type:expense?'expense':'party',...(expense?{payee:selected.name,partyId:selected.id}:{})}} company={company} language={language} from={from} to={to} version={version} parties={report.parties} onBack={()=>setSelected(null)}/></>;
}
