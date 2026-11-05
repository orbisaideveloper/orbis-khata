import { expect, it } from 'vitest';
import { billError, businessReasons, safeBusinessReason } from './business-error';
it('exposes only known reasons, never database messages or credentials', () => {
    expect(safeBusinessReason(null)).toBeUndefined();
    expect(safeBusinessReason(new Error('postgres://password'))).toBeUndefined();
    expect(billError(new Error('private'), 'bn', 'Fallback')).toBe('Fallback');
    for (const reason of businessReasons) {
        expect(safeBusinessReason({ reason })).toBe(reason);
        for (const language of ['bn', 'en', 'hi'] as const) {
            expect(billError({ reason }, language, 'Fallback')).toBeTruthy();
        }
    }
});

it('localizes gateway throttling without exposing unknown server errors',()=>{
 for(const code of ['KHATA_RATE_LIMITED','KHATA_BUSY','KHATA_BODY_TIMEOUT']){
  for(const language of ['bn','en','hi'] as const){expect(billError({code},language,'Fallback')).not.toBe('Fallback');}
 }
 for(const code of ['secret database error','__proto__','constructor']){expect(billError({code},'bn','Fallback')).toBe('Fallback');}
});
