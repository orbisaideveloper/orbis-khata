import { afterEach, expect, it, vi } from 'vitest'
import { confirmDelete } from './confirm-delete'
afterEach(()=>vi.restoreAllMocks())
it.each([['first',false,true,1,false],['second',true,false,2,false],['both',true,true,2,true]]as const)('requires both confirmations: %s',(_name,a,b,count,result)=>{const confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(a).mockReturnValueOnce(b);expect(confirmDelete('en','Party')).toBe(result);expect(confirm).toHaveBeenCalledTimes(count)})
