import {accountingPolicyCopy} from './copy';
export function AccountingPolicy({language,onBack}:Readonly<{language:string;onBack:()=>void}>){
 const t=accountingPolicyCopy(language);
 const sections=[['stockTitle','stock'],['productionTitle','production'],['profitTitle','profit'],['assetTitle','asset'],['historyTitle','history'],['warningTitle','warning']] as const;
 return <section className="accounting-policy" aria-label={t.title}><button type="button" onClick={onBack}>← {t.back}</button><header className="policy-welcome"><span>{t.welcome}</span><h2>{t.title}</h2><p>{t.intro}</p><small>{t.version}</small></header><div className="policy-sections">{sections.map(([title,body],index)=><details key={title}><summary><span className="policy-number">{String(index+1).padStart(2,'0')}</span>{t[title]}</summary><p>{t[body]}</p></details>)}</div></section>;
}
