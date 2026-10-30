import {createLotteryAccountingService,serialize} from '../../vendor/foundation-lottery/runtime/lottery-accounting-service.js';
import {createLotteryStore,decodeLottery,encodeLottery,type LotteryState} from './domain-store.ts';
import {lotteryInput,type LotteryInput} from './protocol.ts';
export {lotteryInput,type LotteryInput} from './protocol.ts';
export async function runLottery(state:unknown,input:LotteryInput,owner:string,clock=()=>new Date()){
 if(!lotteryInput(input))throw new Error('LOTTERY_INPUT_INVALID');
 const store=createLotteryStore(decodeLottery(state??{}) as LotteryState,clock);
 const service=createLotteryAccountingService({prisma:store.client,now:clock});
 // Original cloud/device preference is honored by the copied local projection.
 const result=await service[input.method](input.payload,owner);
 return {result:serialize(result),state:encodeLottery(store.snapshot())};
}
