import { afterEach, expect,it,vi } from 'vitest'
import { cleanup,render,screen,fireEvent,waitFor } from '@testing-library/react'
import { RelayPanel } from './RelayPanel'
import { readRelayCache } from './storage'
import { syncStatements } from './client'
import { sourceChoices } from './source'
import { requestStatementRelay } from '../../accounting/api'
import type { Cache } from './model'
vi.mock('./storage',()=>({readRelayCache:vi.fn()}))
vi.mock('./client',()=>({syncStatements:vi.fn()}))
vi.mock('./source',()=>({sourceChoices:vi.fn()}))
vi.mock('../../accounting/api',()=>({requestStatementRelay:vi.fn()}))
afterEach(()=>{cleanup();vi.resetAllMocks()})
const scope={module:'khata' as const,company:'11111111-1111-4111-8111-111111111111',party:'22222222-2222-4222-8222-222222222222',companyName:'Synthetic books',partyName:'Own party'}
const link={...scope,id:'33333333-3333-4333-8333-333333333333',recipient:'ORB-U-23456789',status:'accepted' as const,outgoing:false,revision:1,acknowledged:1,resync:false}
const cache:Cache={version:1,links:{[link.id]:{link,revision:1,receivedAt:'2026-11-21T12:00:00Z',dataset:{scope,rows:[{id:'opening',date:'2026-01-01',reference:'',kind:'opening',account:'receivable',amount:'100'},{id:'bill',date:'2026-11-21',reference:'S1',kind:'sale',account:'receivable',amount:'200'},{id:'purchase',date:'2026-11-21',reference:'P1',kind:'purchase',account:'payable',amount:'50'}]}}}}
function setup(value=cache) {
 vi.mocked(readRelayCache).mockResolvedValue(structuredClone(value))
 vi.mocked(syncStatements).mockResolvedValue(structuredClone(value))
 vi.mocked(requestStatementRelay).mockResolvedValue({saved:true})
 render(<RelayPanel actor="actor" language="en"/>)
}
it('opens a saved statement offline with date filtering and independent payable balance',async()=>{
 setup();fireEvent.click(await screen.findByRole('button',{name:'View saved statement'}))
 expect(screen.getByText('S1')).toBeVisible()
 expect(screen.getByText('Opening: ₹1.00 · Closing: ₹3.00')).toBeVisible()
 expect(screen.getByText('You receive / advance')).toBeVisible()
 fireEvent.change(screen.getByLabelText('To'),{target:{value:'2026-11-20'}})
 expect(screen.queryByText('S1')).not.toBeInTheDocument()
 vi.mocked(syncStatements).mockRejectedValueOnce(new Error('offline'))
 fireEvent.click(screen.getByRole('button',{name:'Sync statements'}));await screen.findByRole('alert')
 expect(screen.getByRole('button',{name:'View saved statement'})).toBeEnabled()
})
it('accepts only the selected incoming invitation and requests recovery',async()=>{
 const pending=structuredClone(cache);pending.links[link.id].link.status='pending';delete pending.links[link.id].dataset
 setup(pending)
 fireEvent.click(await screen.findByRole('button',{name:'Accept'}))
 await waitFor(()=>expect(requestStatementRelay).toHaveBeenCalledWith('actor',{action:'accept',id:link.id}))
 cleanup();setup()
 fireEvent.click(await screen.findByRole('button',{name:'Request full statement again'}))
 await waitFor(()=>expect(requestStatementRelay).toHaveBeenCalledWith('actor',{action:'resync',id:link.id}))
})
it('selects one account and sends a validated ORBIS invitation without financial writes',async()=>{
 setup({version:1,links:{}})
 vi.mocked(sourceChoices).mockResolvedValue([scope])
 fireEvent.click(screen.getByRole('button',{name:'Choose account'}))
 await screen.findByRole('combobox')
 fireEvent.change(screen.getByLabelText('Party account'),{target:{value:'0'}})
 fireEvent.change(screen.getByLabelText('ORBIS ID'),{target:{value:'orb-u-23456789'}})
 fireEvent.click(screen.getByRole('button',{name:'Send invitation'}))
 await waitFor(()=>expect(requestStatementRelay).toHaveBeenCalledWith('actor',expect.objectContaining({action:'invite',scope,recipient:'ORB-U-23456789'})))
})
it('requires explicit confirmation to close a link',async()=>{
 setup();vi.spyOn(window,'confirm').mockReturnValue(false)
 fireEvent.click(await screen.findByRole('button',{name:'Close link'}));expect(requestStatementRelay).not.toHaveBeenCalled()
 vi.mocked(window.confirm).mockReturnValue(true)
 fireEvent.click(screen.getByRole('button',{name:'Close link'}))
 await waitFor(()=>expect(requestStatementRelay).toHaveBeenCalledWith('actor',{action:'revoke',id:link.id}))
 vi.mocked(window.confirm).mockRestore()
})
it('shows known revoked outgoing links without another close control',async()=>{
 const outgoing=structuredClone(cache);outgoing.links[link.id].link={...link,outgoing:true,status:'revoked'}
 setup(outgoing);await screen.findByText('Synthetic books · Own party')
 expect(screen.queryByRole('button',{name:'Close link'})).not.toBeInTheDocument()
})
