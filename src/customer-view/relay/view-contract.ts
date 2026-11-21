import type { Language } from '../../i18n'
import type { Cache } from './model'
export type RelayViewProps = Readonly<{cache:Cache;language:Language;busy:boolean;actor:string;perform:(work:()=>Promise<void>)=>Promise<void>}>
