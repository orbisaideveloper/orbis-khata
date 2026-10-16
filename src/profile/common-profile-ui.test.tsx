import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CommonAccountProfile } from './CommonAccountProfile'
const api=vi.hoisted(()=>({read:vi.fn(),session:vi.fn()}))
vi.mock('../auth/client',()=>({authClient:{auth:{getSession:api.session}}}))
vi.mock('./common-profile',()=>({requestAccountProfile:api.read}))
const response={customer:{orbisIdentityId:'canonical',displayId:'ORB-U-23456789'},profile:{name:'Sample',address:null,alternatePhone:null,dateOfBirth:null,gender:null},contact:{email:'sample@example.test',phone:null}}
beforeEach(()=>{api.session.mockResolvedValue({});api.read.mockReset().mockImplementation(async read=>{await read();return response})})
afterEach(()=>cleanup())
it.each(['bn','en','hi'] as const)('loads the shared profile in %s',async language=>{
 render(<CommonAccountProfile userId="sample-user" language={language}/>);expect(await screen.findByText('sample@example.test')).toBeTruthy();expect(await screen.findByDisplayValue('Sample')).toBeTruthy()
})
it('saves and reloads the profile from the central API',async()=>{
 render(<CommonAccountProfile userId="sample-user" language="en"/>);const name=await screen.findByLabelText('Name');fireEvent.change(name,{target:{value:'Updated'}})
 fireEvent.click(screen.getByRole('button',{name:'Save profile'}));await screen.findByText('Profile saved to your central account.')
 expect(api.read).toHaveBeenLastCalledWith(expect.any(Function),'sample-user',expect.any(AbortSignal),expect.objectContaining({name:'Updated',address:null,gender:null}))
 fireEvent.click(screen.getByRole('button',{name:'Reload'}));await waitFor(()=>expect(api.read).toHaveBeenCalledTimes(3))
})
it('shows retryable read and save errors',async()=>{
 api.read.mockRejectedValueOnce(new Error('private'));render(<CommonAccountProfile userId="sample-user" language="en"/>);await screen.findByText('Profile could not be loaded or saved. Please retry.')
 fireEvent.click(screen.getByRole('button',{name:'Reload'}));await screen.findByLabelText('Name');api.read.mockRejectedValueOnce(new Error('private'))
 fireEvent.click(screen.getByRole('button',{name:'Save profile'}));await screen.findByText('Profile could not be loaded or saved. Please retry.');expect(screen.queryByText('private')).toBeNull()
})
it('aborts in-flight profile reads on account changes',async()=>{
 api.read.mockImplementation(()=>new Promise(()=>{}));const view=render(<CommonAccountProfile userId="old" language="en"/>);const first=api.read.mock.calls[0][2] as AbortSignal
 view.rerender(<CommonAccountProfile userId="new" language="en"/>);expect(first.aborted).toBe(true);view.unmount();expect((api.read.mock.calls[1][2] as AbortSignal).aborted).toBe(true)
})


function deferredProfile(){
 let resolve!:(value:typeof response)=>void, reject!:(error:Error)=>void
 const promise=new Promise<typeof response>((yes,no)=>{resolve=yes;reject=no})
 return {promise,resolve,reject}
}
it('preserves all optional common fields when saving',async()=>{
 const value={...response,profile:{name:'Complete',address:'Kolkata',alternatePhone:'1234567890',dateOfBirth:'2000-01-01',gender:'female'}}
 api.read.mockResolvedValue(value)
 render(<CommonAccountProfile userId="sample-user" language="en"/>);await screen.findByDisplayValue('Complete')
 fireEvent.click(screen.getByRole('button',{name:'Save profile'}));await screen.findByText('Profile saved to your central account.')
 expect(api.read).toHaveBeenLastCalledWith(expect.any(Function),'sample-user',expect.any(AbortSignal),value.profile)
})
it('treats an omitted optional form control as empty',async()=>{
 render(<CommonAccountProfile userId="sample-user" language="en"/>);await screen.findByLabelText('Name')
 screen.getByLabelText('Address').setAttribute('disabled','')
 fireEvent.click(screen.getByRole('button',{name:'Save profile'}));await screen.findByText('Profile saved to your central account.')
 expect(api.read).toHaveBeenLastCalledWith(expect.any(Function),'sample-user',expect.any(AbortSignal),expect.objectContaining({address:null}))
})
it('blocks a response belonging to a different central identity',async()=>{
 render(<CommonAccountProfile userId="sample-user" language="en"/>);await screen.findByLabelText('Name')
 api.read.mockResolvedValueOnce({...response,customer:{...response.customer,orbisIdentityId:'other'}})
 fireEvent.click(screen.getByRole('button',{name:'Save profile'}));await screen.findByText('Profile could not be loaded or saved. Please retry.')
 expect(screen.queryByText('Profile saved to your central account.')).toBeNull()
})
it('ignores a duplicate form submission while a save is pending',async()=>{
 render(<CommonAccountProfile userId="sample-user" language="en"/>);await screen.findByLabelText('Name')
 const pending=deferredProfile();api.read.mockReturnValueOnce(pending.promise)
 const form=screen.getByRole('button',{name:'Save profile'}).closest('form')!
 fireEvent.submit(form);fireEvent.submit(form);expect(api.read).toHaveBeenCalledTimes(2)
 await act(async()=>{pending.resolve(response);await pending.promise})
 await screen.findByText('Profile saved to your central account.')
})
it.each(['resolve','reject'] as const)('does not expose a late %s from a previous account read',async outcome=>{
 const pending=deferredProfile();api.read.mockReturnValueOnce(pending.promise)
 const view=render(<CommonAccountProfile userId="old" language="en"/>);view.unmount()
 await act(async()=>{if(outcome==='resolve')pending.resolve(response);else pending.reject(new Error('private'));await pending.promise.catch(()=>{})})
 expect(screen.queryByText('sample@example.test')).toBeNull()
})
it.each(['resolve','reject'] as const)('aborts an in-flight save before a late %s',async outcome=>{
 const view=render(<CommonAccountProfile userId="sample-user" language="en"/>);await screen.findByLabelText('Name')
 const pending=deferredProfile();api.read.mockReturnValueOnce(pending.promise)
 fireEvent.click(screen.getByRole('button',{name:'Save profile'}));const signal=api.read.mock.calls.at(-1)![2] as AbortSignal
 view.unmount();expect(signal.aborted).toBe(true)
 await act(async()=>{if(outcome==='resolve')pending.resolve(response);else pending.reject(new Error('private'));await pending.promise.catch(()=>{})})
 expect(screen.queryByText('Profile saved to your central account.')).toBeNull()
})
