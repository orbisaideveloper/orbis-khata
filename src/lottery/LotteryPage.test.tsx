import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
vi.mock('../../vendor/foundation-lottery/src/admin/dashboard/sections/LotteryAccountingWorkspace',()=>({LotteryAccountingWorkspace:({localScope}:{localScope:{ownerKind:string;ownerId:string}})=><p>{localScope.ownerKind}:{localScope.ownerId}</p>}));
import LotteryPage from './LotteryPage';
afterEach(cleanup);
it('opens the copied forms in the current owner partition and returns to the module picker',()=>{const back=vi.fn();render(<LotteryPage owner="current-owner" language="bn" onBack={back}/>);expect(screen.getByRole('region',{name:'লটারি হিসাব'})).toBeInTheDocument();expect(screen.getByText('PUBLIC_USER:current-owner')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:/মডিউল/}));expect(back).toHaveBeenCalledOnce();});
