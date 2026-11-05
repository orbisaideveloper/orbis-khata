import {describe,it,expect} from 'vitest';
import {boundedGatewayBody,createIngressGuard} from './gateway-admission.ts';
describe('gateway resource admission',()=>{
 it('preserves Bengali bodies within the existing character envelope',async()=>{
  const text='ক'.repeat(16000);expect(await boundedGatewayBody(new Request('https://example.test',{method:'POST',body:text}))).toBe(text);
 });
 it('rejects oversized text and streamed bytes',async()=>{
  await expect(boundedGatewayBody(new Request('https://example.test',{method:'POST',body:'x'.repeat(16385)}))).rejects.toMatchObject({status:413});
  await expect(boundedGatewayBody(new Request('https://example.test',{method:'POST',body:'ক'.repeat(23000)}))).rejects.toMatchObject({status:413});
 });
 it('cancels a stalled body at the deadline',async()=>{
  let cancelled=false;
  const body=new ReadableStream<Uint8Array>({cancel(){cancelled=true;}});
  await expect(boundedGatewayBody(new Request('https://example.test',{method:'POST',body,duplex:'half'} as RequestInit),5)).rejects.toMatchObject({status:408});
  expect(cancelled).toBe(true);
 });
 it('bounds concurrent work and releases exactly once',()=>{
  const acquire=createIngressGuard(1),release=acquire();expect(acquire).toThrow('KHATA_BUSY');release();release();expect(acquire).not.toThrow();
 });
});
