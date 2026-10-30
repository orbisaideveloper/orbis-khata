import {cleanup,render,screen} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {BillStock} from './BillStock';
afterEach(cleanup);
const props={lines:[{item:'m',quantity:'45.5'},{item:'m',quantity:'1'}],stocks:[{item:'m',warehouse:'w',closing:'2000000'}],warehouse:'w',items:[{id:'m',name:'Milk',unit:'litre'}],kind:'sale',language:'en' as const};
it('aggregates repeated items and displays exact negative projected stock',()=>{render(<BillStock {...props}/>);expect(screen.getByText('-44.5 litre')).toHaveClass('negative');expect(screen.getAllByText(/Milk/)).toHaveLength(1);});
it('adds purchase quantities and does not invent a stock balance when loading failed',()=>{const {rerender}=render(<BillStock {...props} kind="purchase"/>);expect(screen.getByText('48.5 litre')).toBeInTheDocument();rerender(<BillStock {...props} stocks={null}/>);expect(screen.getByText('— litre')).toBeInTheDocument();rerender(<BillStock {...props} lines={[{item:'m',quantity:'bad'}]}/>);expect(screen.getByText('— litre')).toBeInTheDocument();rerender(<BillStock {...props} kind="expense"/>);expect(screen.queryByText(/Stock after/)).toBeNull();});
