import {LotteryAccountingWorkspace} from '../../vendor/foundation-lottery/src/admin/dashboard/sections/LotteryAccountingWorkspace';
import type {Language} from '../i18n';
import {inLanguage} from '../localize';
import './lottery.css';
export default function LotteryPage({owner,language,onBack}:Readonly<{owner:string;language:Language;onBack:()=>void}>){
 return <section className="lottery-module" aria-label={inLanguage(language,'লটারি হিসাব','लॉटरी हिसाब','Lottery accounts')}><header className="module-heading"><h1>ORBIS · {inLanguage(language,'লটারি','लॉटरी','Lottery')}</h1><button onClick={onBack}>← {inLanguage(language,'মডিউল','मॉड्यूल','Modules')}</button></header><LotteryAccountingWorkspace localScope={{ownerKind:'PUBLIC_USER',ownerId:owner}}/></section>;
}
