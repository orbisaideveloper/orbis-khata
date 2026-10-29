import type { Language } from './i18n';
import { booksLabels, type BooksPage } from './books-navigation';
import { inLanguage } from './localize';
import { DesignIcon } from './demo/DesignIcon';
export function BooksBottomNav({language,page,onOpen}:Readonly<{language:Language;page:BooksPage;onOpen:(page:BooksPage)=>void}>){
 const labels=booksLabels[language];return <nav className="kh-bottom-nav" aria-label={inLanguage(language,'প্রধান নেভিগেশন','मुख्य नेविगेशन','Main navigation')}>{(['home','bills','all-ledgers']as const).map(target=><button type="button" key={target} aria-current={page===target?'page':undefined} onClick={()=>onOpen(target)}><DesignIcon name={target==='all-ledgers'?'ledger':target}/><span>{labels[target]}</span></button>)}<button type="button" onClick={()=>{document.querySelector<HTMLDetailsElement>('.workspace-menu')?.setAttribute('open','');}}><DesignIcon name="more"/><span>{inLanguage(language,'আরও','और','More')}</span></button></nav>;
}
