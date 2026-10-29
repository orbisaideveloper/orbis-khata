import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {PartySection} from './PartySection';
import {emptyPartyDetails,type DemoParty} from './master-model';
vi.mock('../accounting/LedgerExplorer',()=>({LedgerExplorer:({initialSelection,onBack}:{initialSelection:unknown;onBack:()=>void})=><button onClick={onBack}>{JSON.stringify(initialSelection)}</button>}));
afterEach(cleanup);
it.each(['customer','expense']as const)('opens %s detail with the correct ledger identity and returns to the list',kind=>{const party:DemoParty={...emptyPartyDetails,id:'p',company:'c',name:'Trader',kind,receivable:'0',payable:'0',phone:'9876543210',email:'hello@example.test',address:'Town'};render(<PartySection company="c" language="en" parties={[party]} report={{balances:{},ledger_balances:{},parties:[party],entries:[],count:0,as_of:''}} from="2026-10-01" to="2026-10-29" version={0} onChanged={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Trader'}));const detail=screen.getByRole('button',{name:/"type"/});expect(detail.textContent).toContain(kind==='expense'?'"type":"expense"':'"type":"party"');expect(screen.getByText(/hello@example.test/)).toBeInTheDocument();fireEvent.click(detail);expect(screen.getByRole('button',{name:'Trader'})).toBeInTheDocument();});
