import type {Language} from '../i18n';
import {inLanguage} from '../localize';
import {lineAmount} from './record-line-amount';
import {money} from './model';
type Line={key:string;description:string;qty:string;rate:string;unit:string};
export function ExpenseLines({lines,language,onChange}:Readonly<{lines:Line[];language:Language;onChange?:(index:number,field:'description'|'qty'|'rate',value:string)=>void}>){
 const labels=[inLanguage(language,'বিবরণ','विवरण','Description'),inLanguage(language,'পরিমাণ','मात्रा','Quantity'),inLanguage(language,'দর','दर','Rate'),inLanguage(language,'টাকা','रकम','Amount')];
 return <div className="record-items expense-edit-lines"><table><thead><tr><th>#</th>{labels.map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{lines.map((line,index)=><tr key={line.key}><td>{index+1}</td>{(['description','qty','rate'] as const).map((field,col)=><td key={field}>{onChange?<input aria-label={labels[col]} inputMode={col?'decimal':'text'} value={line[field]} onChange={event=>onChange(index,field,event.target.value)}/>:line[field]}</td>)}<td>{money(lineAmount({quantity:line.qty,rate:line.rate}))}</td></tr>)}</tbody></table></div>;
}
