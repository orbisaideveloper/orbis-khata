import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {StockWorkspace} from './StockWorkspace';
import {BookServicesContext,type BookServices} from '../books-services';
import {defaultSettings} from '../accounting/workspace-contract';
const company='11111111-1111-4111-8111-111111111111';
afterEach(cleanup);
it('loads all historical pages, shows value totals and allocates common cost per selected godown',async()=>{const documents=[{id:'purchase',company,kind:'purchase',date:'2026-10-01',total:'20000',reversed:false,lines:[{item:'i',warehouse:'a',to:null,quantity:'2000000',rate:'10000'}]}];const report={items:[{id:'i',name:'Feed',unit:'kg',code:'F'}],warehouses:[{id:'a',name:'Main',code:'M'},{id:'b',name:'Shop',code:'S'}],stocks:[{item:'i',warehouse:'a',closing:'1000000'},{item:'i',warehouse:'b',closing:'1000000'}],documents,count:1};const request=vi.fn(async(op:string)=>op==='workspace'?defaultSettings():report);render(<BookServicesContext.Provider value={{request} as unknown as BookServices}><StockWorkspace company={company} userId="u" language="en" to="2026-10-02" version={0} onChanged={vi.fn()} onSelect={vi.fn()}/></BookServicesContext.Provider>);await screen.findByText('Total stock value');expect(screen.getAllByText('₹200.00')).toHaveLength(2);expect(request).toHaveBeenCalledWith('inventory-report',expect.objectContaining({from:'0001-01-01',offset:0}));fireEvent.change(screen.getByLabelText('Godown'),{target:{value:'b'}});expect(screen.getAllByText('₹100.00')).toHaveLength(2);});
