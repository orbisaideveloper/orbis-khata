import {expect,it} from 'vitest';
import {invoiceCopy} from './invoice-copy';
it.each(['bn','en','hi'] as const)('retains complete bill labels in %s',language=>{
 const text=invoiceCopy(language);expect(text.number).toBe({bn:'বিল নম্বর',en:'Bill number',hi:'बिल नंबर'}[language]);expect(text.quantity).toBe({bn:'পরিমাণ',en:'Quantity',hi:'मात्रा'}[language]);expect(text.confirm).toBe({bn:'নিশ্চিত করে সংরক্ষণ',en:'Confirm & save',hi:'पुष्टि और सहेजें'}[language]);expect(Object.keys(text)).toEqual(Object.keys(invoiceCopy('en')));expect(Object.values(text).every(v=>typeof v==='string'&&v.trim().length>0)).toBe(true);
});
