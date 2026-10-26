import type { Language } from './i18n'
const copy={bn:['মুছতে চান?','শেষবার নিশ্চিত করুন—মুছে দেবেন?'],en:['Delete this?','Final confirmation — delete this?'],hi:['मिटाना चाहते हैं?','अंतिम पुष्टि — मिटा दें?']}
export function confirmDelete(language:Language,name:string){const t=copy[language];return window.confirm(t[0]+'\n'+name)&&window.confirm(t[1]+'\n'+name)}
