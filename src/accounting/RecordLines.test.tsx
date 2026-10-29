import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {RecordLines} from './RecordLines';
import {RecordSettlement} from './RecordSettlement';
import {lineAmount} from './record-line-amount';
afterEach(cleanup);
it('keeps exact rate while displaying two decimals, with compact editable table cells',()=>{
 const change=vi.fn();const {container}=render(<RecordLines language="en" names={{milk:'Milk'}} lines={[{key:'a',item:'milk',warehouse:'w',quantity:'37',rate:'30.54054054'}]} onChange={change}/>);
 expect(container.querySelector('fieldset')).toBeNull();expect(screen.getByRole('cell',{name:'Milk'})).toBeInTheDocument();
 const rate=screen.getByLabelText('Rate');expect(rate).toHaveValue('30.54');fireEvent.focus(rate);expect(rate).toHaveValue('30.54054054');fireEvent.blur(rate);expect(change).not.toHaveBeenCalled();
 fireEvent.change(screen.getByLabelText('Quantity'),{target:{value:'38'}});expect(change).toHaveBeenCalledWith(0,'quantity','38');fireEvent.change(rate,{target:{value:'31'}});expect(change).toHaveBeenCalledWith(0,'rate','31');
 expect(lineAmount({quantity:'37',rate:'30.54054054'})).toBe(113000n);expect(lineAmount({quantity:'',rate:'5'})).toBe(0n);
});
it('shows settlement and signed remaining amounts without throwing on incomplete input',()=>{
 const change=vi.fn();const {rerender}=render(<RecordSettlement total={10000n} paid="125" onPaid={change} language="en"/>);expect(screen.getByText('−₹25.00')).toBeInTheDocument();fireEvent.change(screen.getByLabelText('Received / paid'),{target:{value:'50'}});expect(change).toHaveBeenCalledWith('50');rerender(<RecordSettlement total={10000n} paid="" onPaid={change} language="bn"/>);expect(screen.getByText('—')).toBeInTheDocument();
});
