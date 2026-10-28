import {expect,it}from'vitest';
import {billError,businessReasons,safeBusinessReason}from'./business-error';
it('exposes only known reasons, never database messages or credentials',()=>{expect(safeBusinessReason(null)).toBeUndefined();expect(safeBusinessReason(new Error('postgres://password'))).toBeUndefined();expect(billError(new Error('private'),'bn','Fallback')).toBe('Fallback');for(const reason of businessReasons){expect(safeBusinessReason({reason})).toBe(reason);for(const language of ['bn','en','hi']as const)expect(billError({reason},language,'Fallback')).toBeTruthy();}});
