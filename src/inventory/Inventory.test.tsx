import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Inventory } from './Inventory'
import type { InventoryReport } from './model'
const api=vi.hoisted(()=>({inventoryReport:vi.fn(),postInventory:vi.fn()}))
vi.mock('./api',()=>api)
vi.mock('../accounting/api',()=>({rejected:(error:{code?:string})=>error.code==='P0001'}))
const company='11111111-1111-4111-8111-111111111111',item='22222222-2222-4222-8222-222222222222',warehouse='33333333-3333-4333-8333-333333333333',party='44444444-4444-4444-8444-444444444444'
const report:InventoryReport={items:[{id:item,code:'M1',name:'Milk',unit:'litre'}],warehouses:[{id:warehouse,code:'G1',name:'Shop'}],stocks:[{item,warehouse,opening:'10000000',incoming:'0',outgoing:'1250000',closing:'8750000'}],documents:[],count:0}
const lock=vi.fn(),changed=vi.fn()
function mount(){return render(<Inventory userId="owner" company={company} companyName="My Shop" language="en" from="2026-10-01" to="2026-10-25" version={0} parties={[{id:party,name:'Party',kind:'both',receivable:'0',payable:'0'}]} onLock={lock} onChanged={changed} blocked={false}/>)}
beforeEach(()=>{vi.resetAllMocks();sessionStorage.clear();api.inventoryReport.mockResolvedValue(report);api.postInventory.mockResolvedValue(undefined)})
afterEach(()=>{cleanup();vi.restoreAllMocks()})
async function purchase(){mount();fireEvent.click(await screen.findByRole('button',{name:'Purchase bill'}));const form=screen.getByRole('heading',{name:'Purchase bill'}).closest('form')!;const f=within(form);fireEvent.change(f.getByLabelText('Party'),{target:{value:party}});fireEvent.change(f.getByLabelText('Item list'),{target:{value:item}});fireEvent.change(f.getByLabelText('Godown'),{target:{value:warehouse}});fireEvent.change(f.getByLabelText('Quantity'),{target:{value:'1.25'}});fireEvent.change(f.getByLabelText('Rate (INR / unit)'),{target:{value:'123.45'}});fireEvent.submit(form)}
it('shows real unit quantities and sends one exact itemized bill only after confirmation',async()=>{
 await purchase();expect(api.postInventory).not.toHaveBeenCalled();expect(screen.getByText('Total: ₹154.31')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Confirm & save'}));await screen.findByText('Saved successfully.')
 expect(api.postInventory).toHaveBeenCalledOnce();expect(api.postInventory.mock.calls[0][0]).toMatchObject({company,kind:'purchase',party,lines:[{item,warehouse,to:null,quantity:'1250000',rate:'12345'}]});expect(changed).toHaveBeenCalledOnce()
})
it('persists an uncertain bill and retries the exact same ID after reload',async()=>{
 api.postInventory.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
 await purchase();fireEvent.click(screen.getByRole('button',{name:'Confirm & save'}));await screen.findByText(/Save is not confirmed/)
 const first=api.postInventory.mock.calls[0][0];cleanup();mount();fireEvent.click(await screen.findByRole('button',{name:'Retry same entry'}));await screen.findByText('Saved successfully.')
 expect(api.postInventory.mock.calls[1][0]).toEqual(first)
})
it('does not send a bill when recovery storage is unavailable',async()=>{
 await purchase();vi.spyOn(Object.getPrototypeOf(sessionStorage),'setItem').mockImplementation(()=>{throw Error('blocked')})
 fireEvent.click(screen.getByRole('button',{name:'Confirm & save'}));expect(screen.getByText(/Safe retry storage is unavailable/)).toBeInTheDocument();expect(api.postInventory).not.toHaveBeenCalled()
})
it('fails closed on report failure and never fabricates stock zeroes',async()=>{
 api.inventoryReport.mockRejectedValue(new Error('offline'));mount();await screen.findByText(/Stock could not be loaded/);expect(screen.queryByRole('button',{name:'Purchase bill'})).toBeNull()
})
it('creates a custom-unit master after review and cancellation sends nothing',async()=>{
 mount();fireEvent.click(await screen.findByRole('button',{name:'New item'}));const form=screen.getByLabelText('Code').closest('form')!
 fireEvent.change(screen.getByLabelText('Code'),{target:{value:'R-01'}});fireEvent.change(screen.getByLabelText('Name'),{target:{value:'Rice'}});fireEvent.change(screen.getByLabelText('Unit'),{target:{value:'কেজি'}});fireEvent.submit(form)
 await waitFor(()=>expect(lock).toHaveBeenLastCalledWith(true));fireEvent.click(screen.getByRole('button',{name:'Cancel'}));expect(api.postInventory).not.toHaveBeenCalled()
})
it('transfers reviewed quantities between godowns and lets the user remove extra lines',async()=>{
 const destination='55555555-5555-4555-8555-555555555555'
 api.inventoryReport.mockResolvedValue({...report,warehouses:[...report.warehouses,{id:destination,code:'G2',name:'Depot'}]})
 mount();fireEvent.click(await screen.findByRole('button',{name:'Godown transfer'}))
 fireEvent.click(screen.getByRole('button',{name:'Add item line'}))
 expect(screen.getAllByRole('group')).toHaveLength(2)
 fireEvent.click(screen.getAllByRole('button',{name:'Remove'})[1])
 expect(screen.getAllByRole('group')).toHaveLength(1)
 fireEvent.change(screen.getByLabelText('Item list'),{target:{value:item}})
 fireEvent.change(screen.getByLabelText('Godown'),{target:{value:warehouse}})
 expect(within(screen.getByLabelText('To godown')).queryByRole('option',{name:'Shop'})).toBeNull()
 fireEvent.change(screen.getByLabelText('To godown'),{target:{value:destination}})
 fireEvent.change(screen.getByLabelText('Quantity'),{target:{value:'2.5'}})
 fireEvent.change(screen.getByLabelText('Note / reason'),{target:{value:'Move to depot'}})
 fireEvent.submit(screen.getByLabelText('Quantity').closest('form')!)
 expect(screen.getByText('Shop')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'Confirm & save'}));await screen.findByText('Saved successfully.')
 expect(api.postInventory).toHaveBeenCalledWith(expect.objectContaining({kind:'transfer',note:'Move to depot',lines:[{item,warehouse,to:destination,quantity:'2500000',rate:'0'}]}))
})
it('filters actual stock, paginates history and previews and prints the selected bill',async()=>{
 const doc={id:'66666666-6666-4666-8666-666666666666',company,kind:'sale' as const,date:'2026-10-20',code:'',name:'',unit:'',party,reference:'SALE-001',note:'Paid',lines:[{item,warehouse,to:null,quantity:'1250000',rate:'12345'}],total:'15431',reversed:true,party_name:'Party'}
 api.inventoryReport.mockResolvedValue({...report,documents:[doc],count:51})
 const print=vi.spyOn(window,'print').mockImplementation(()=>{})
 mount();await screen.findByRole('button',{name:'View bill'})
 fireEvent.change(screen.getByLabelText('Find item by code or name'),{target:{value:'missing'}})
 expect(screen.queryByText('M1')).toBeNull()
 fireEvent.change(screen.getByLabelText('Find item by code or name'),{target:{value:'milk'}})
 expect(screen.getByText('M1')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'View bill'}))
 const preview=screen.getByRole('region',{name:'Itemized bill'})
 expect(within(preview).getByText('Party')).toBeInTheDocument()
 expect(within(preview).getByText('Total: ₹154.31')).toBeInTheDocument()
 fireEvent.click(within(preview).getByRole('button',{name:'Print bill'}));expect(print).toHaveBeenCalledOnce()
 fireEvent.click(within(preview).getByRole('button',{name:'Close bill'}));expect(screen.queryByRole('region',{name:'Itemized bill'})).toBeNull()
 fireEvent.click(screen.getByRole('button',{name:'Next'}));await waitFor(()=>expect(api.inventoryReport).toHaveBeenLastCalledWith(company,'2026-10-01','2026-10-25',50))
 fireEvent.click(await screen.findByRole('button',{name:'Previous'}));await waitFor(()=>expect(api.inventoryReport).toHaveBeenLastCalledWith(company,'2026-10-01','2026-10-25',0))
})
it('retries a failed report and cancels the edit form without posting',async()=>{
 api.inventoryReport.mockRejectedValueOnce(new Error('network')).mockResolvedValue(report)
 mount();fireEvent.click(await screen.findByRole('button',{name:'Retry same entry'}))
 fireEvent.click(await screen.findByRole('button',{name:'New godown'}))
 fireEvent.click(screen.getByRole('button',{name:'Cancel'}))
 expect(screen.queryByLabelText('Code')).toBeNull();expect(api.postInventory).not.toHaveBeenCalled()
})
it('clears a definite rejection and allows a corrected draft without silently retrying',async()=>{
 api.postInventory.mockRejectedValueOnce({code:'P0001'})
 await purchase();fireEvent.click(screen.getByRole('button',{name:'Confirm & save'}))
 await screen.findByText(/The server rejected this entry/)
 expect(sessionStorage.length).toBe(0)
 expect(screen.queryByRole('button',{name:'Retry same entry'})).toBeNull()
 expect(screen.getByRole('button',{name:'Purchase bill'})).toBeEnabled()
 expect(api.postInventory).toHaveBeenCalledOnce()
})
