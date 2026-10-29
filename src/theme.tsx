import {useTheme} from './use-theme';
import type {Language} from './i18n';
import {inLanguage} from './localize';
type Theme='glass'|'blue';
function choose(next:Theme){try{localStorage.setItem('orbis.khata.theme.v1',next);}catch{/* Keep controls usable without device storage. */}window.dispatchEvent(new Event('khata-theme'));}
export function Themes({language}:Readonly<{language:Language}>){const theme=useTheme();return <section className="books-card theme-settings"><h2>{inLanguage(language,'থিমস','थीम','Themes')}</h2><p>{inLanguage(language,'আপনার পছন্দের রং বেছে নিন।','अपना पसंदीदा रंग चुनें।','Choose your preferred appearance.')}</p>{(['glass','blue']as const).map(value=><button type="button" aria-pressed={theme===value} key={value} onClick={()=>choose(value)}>{value==='glass'?inLanguage(language,'গ্লাস · সবুজ','ग्लास · हरा','Glass · green'):inLanguage(language,'সিম্পল · ব্লু','सरल · नीला','Simple · blue')}</button>)}</section>;}
