import { expect,it } from 'vitest'
import { amountFromRate,rateFromAmount,rateMinor,updatePricing } from './amounts'
it('calculates both directions with exact integer arithmetic',()=>{
 expect(amountFromRate('20','1750')).toBe('3500000')
 expect(rateFromAmount('20','35000')).toBe('1750.00')
 expect(rateFromAmount('3','100')).toBe('33.33333333')
 expect(amountFromRate('3',rateFromAmount('3','100'))).toBe('10000')
 expect(rateFromAmount('1.25','154.31')).toBe('123.448')
 expect(rateMinor('33.33333333')).toBe('3333')
})
it('keeps the last entered amount or rate authoritative when quantity changes',()=>{
 const line={quantity:'2',rate:'50',amount:'100.00',basis:'rate' as const}
 expect(updatePricing(line,'quantity','3')).toMatchObject({amount:'150.00',rate:'50'})
 const amount=updatePricing(line,'amount','120')
 expect(amount).toMatchObject({rate:'60.00',basis:'amount'})
 expect(updatePricing(amount,'quantity','3')).toMatchObject({amount:'120',rate:'40.00'})
 expect(updatePricing(amount,'rate','70')).toMatchObject({amount:'140.00',basis:'rate'})
})
it('fails closed for zero/missing quantity and preserves exact cents at quantity limits',()=>{
 expect(()=>rateFromAmount('0','100')).toThrow()
 expect(updatePricing({quantity:'2',rate:'50',amount:'100',basis:'amount'},'quantity','')).toMatchObject({rate:'',amount:'100'})
 for(const qty of ['0.000001','0.01','3','999999.999999'])expect(amountFromRate(qty,rateFromAmount(qty,'0.01'))).toBe('1')
 expect(()=>amountFromRate('1','-1')).toThrow()
})
