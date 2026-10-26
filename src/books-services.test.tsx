import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { afterEach,expect,it,vi } from 'vitest'
import { BookServicesContext,type BookServices } from './books-services'
import { ItemMaster,PartyMaster } from './demo/Masters'
import { emptyPartyDetails } from './demo/master-model'
const company='11111111-1111-4111-8111-111111111111'
const item={id:crypto.randomUUID(),company,name:'Cloud milk',unit:'litre',code:'',default_rate:null}
const party={id:crypto.randomUUID(),company,name:'Cloud customer',kind:'customer' as const,receivable:'0',payable:'0',...emptyPartyDetails}
function services(){return {request:vi.fn(),saveParty:vi.fn().mockResolvedValue(undefined),saveItem:vi.fn().mockResolvedValue(undefined),deleteParty:vi.fn().mockResolvedValue(undefined),deleteItem:vi.fn().mockResolvedValue(undefined),previous:vi.fn(),expenseBill:vi.fn()} as BookServices}
afterEach(()=>{cleanup();vi.restoreAllMocks()})
it('awaits the real party service and keeps contact/opening details in its payload',async()=>{
 const s=services(),changed=vi.fn();render(<BookServicesContext.Provider value={s}><PartyMaster language="en" company={company} parties={[party]} onChanged={changed}/></BookServicesContext.Provider>)
 fireEvent.click(screen.getByRole('button',{name:'Edit: Cloud customer'}));fireEvent.change(screen.getByLabelText('Phone number'),{target:{value:'+919876543210'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));await waitFor(()=>expect(changed).toHaveBeenCalledOnce());expect(s.saveParty).toHaveBeenCalledWith({...party,phone:'+919876543210'})
})
it.each([false,true])('deletes only after both confirmations and waits for the cloud: second=%s',async second=>{
 const s=services(),changed=vi.fn(),confirm=vi.spyOn(window,'confirm').mockReturnValueOnce(true).mockReturnValueOnce(second)
 render(<BookServicesContext.Provider value={s}><ItemMaster language="en" company={company} items={[item]} onChanged={changed}/></BookServicesContext.Provider>);fireEvent.click(screen.getByRole('button',{name:'Delete: Cloud milk'}));expect(confirm).toHaveBeenCalledTimes(2)
 if(second){await waitFor(()=>expect(changed).toHaveBeenCalledOnce());expect(s.deleteItem).toHaveBeenCalledWith(company,item.id)}else{expect(s.deleteItem).not.toHaveBeenCalled();expect(changed).not.toHaveBeenCalled()}
})
it('keeps the party visible and reports a rejected historical-party deletion',async()=>{
 const s=services(),changed=vi.fn();vi.mocked(s.deleteParty).mockRejectedValue(new Error('PARTY_IN_USE'));vi.spyOn(window,'confirm').mockReturnValue(true)
 render(<BookServicesContext.Provider value={s}><PartyMaster language="en" company={company} parties={[party]} onChanged={changed}/></BookServicesContext.Provider>);fireEvent.click(screen.getByRole('button',{name:'Delete: Cloud customer'}));await screen.findByRole('alert');expect(changed).not.toHaveBeenCalled();expect(screen.getByText('Cloud customer')).toBeInTheDocument()
})

it('keeps an unsuccessful item edit open, allows exact retry and can cancel without saving',async()=>{
 const s=services(),changed=vi.fn();vi.mocked(s.saveItem).mockRejectedValueOnce(new Error('OPENING_ALREADY_USED')).mockResolvedValue(undefined)
 render(<BookServicesContext.Provider value={s}><ItemMaster language="en" company={company} items={[item]} onChanged={changed}/></BookServicesContext.Provider>);fireEvent.change(screen.getByLabelText('Search by name or code'),{target:{value:'milk'}});fireEvent.click(screen.getByRole('button',{name:'Edit: Cloud milk'}));fireEvent.click(screen.getByRole('button',{name:'Save'}));await screen.findByRole('alert');expect(changed).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Save'}));await waitFor(()=>expect(changed).toHaveBeenCalledOnce());fireEvent.click(screen.getByRole('button',{name:'Edit: Cloud milk'}));fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(screen.getByRole('button',{name:'Edit: Cloud milk'})).toBeInTheDocument()
})
it('keeps rejected party data available for correction and calls inline cancellation',async()=>{
 const s=services(),cancel=vi.fn();vi.mocked(s.saveParty).mockRejectedValue(new Error('INVALID_PARTY'))
 render(<BookServicesContext.Provider value={s}><PartyMaster language="en" company={company} parties={[]} startKind="customer" onChanged={()=>{}} onCancelCreate={cancel}/></BookServicesContext.Provider>);fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Rejected party'}});fireEvent.click(screen.getByRole('button',{name:'Save'}));await screen.findByRole('alert');expect(screen.getByLabelText('Name')).toHaveValue('Rejected party');fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(cancel).toHaveBeenCalledOnce()
})
