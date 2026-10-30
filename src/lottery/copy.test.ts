import {expect,it} from 'vitest';
import {lotteryLabel} from './copy';
it('keeps the selected home language consistent and leaves names/amounts untouched',()=>{expect(lotteryLabel('en','Cash')).toBe('Cash');expect(lotteryLabel('bn','Cash')).toBe('ক্যাশ');expect(lotteryLabel('hi','Commission')).toBe('कमीशन');expect(lotteryLabel('bn','My shop')).toBe('My shop');expect(lotteryLabel('hi','₹1.00')).toBe('₹1.00');});
