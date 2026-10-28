import type { Language } from '../i18n';
export type RecordDetailProps = Readonly<{company:string;id:string;mode:'view'|'edit'|'delete';language:Language;onClose:()=>void;onChanged:()=>void}>;
