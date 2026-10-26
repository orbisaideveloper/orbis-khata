type OpeningSide='none'|'due'|'advance'
export type PartyDetails={phone:string;email:string;address:string;credit_limit:string|null;credit_days:number|null;opening_amount:string;opening_side:OpeningSide;opening_date:string;opening_account:'receivable'|'payable'|'expense_payable'}
export const emptyPartyDetails:PartyDetails={phone:'',email:'',address:'',credit_limit:null,credit_days:null,opening_amount:'0',opening_side:'none',opening_date:'',opening_account:'receivable'}
export type DemoItem={id:string;company:string;name:string;code:string;unit:string;default_rate:string|null}
export type DemoParty={id:string;company:string;name:string;kind:'customer'|'supplier'|'both'|'expense';receivable:string;payable:string}&PartyDetails
export function optionalMinor(value:string):string|null{
 const input=value.trim();if(!input)return null
 if(!/^\d{1,10}(\.\d{1,2})?$/u.test(input))throw Error('INVALID_AMOUNT')
 const [whole,fraction='']=input.split('.');return String(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')))
}
export function decimal(value:string|null){return value===null?'':`${BigInt(value)/100n}.${String(BigInt(value)%100n).padStart(2,'0')}`}
export function itemLabel(item:{name:string;code:string}){return item.code&&item.code.toLocaleLowerCase()!==item.name.toLocaleLowerCase()?`${item.name} · ${item.code}`:item.name}
