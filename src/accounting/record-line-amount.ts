import {minor} from './model';
import {amountFromRate} from '../billing/amounts';
export function lineAmount(line:{quantity:string;rate:string}){try{return BigInt(amountFromRate(line.quantity,line.rate));}catch{return 0n;}}
export function settlementMinor(input:string){return /^[0০०]+(?:\.[0০०]{1,2})?$/u.test(input.trim())?'0':minor(input);}
