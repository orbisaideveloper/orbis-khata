import {expect,test} from '@playwright/test'
import {relayCommand} from '../src/customer-view/relay/model'
test('statement is durably saved before ACK and survives reload when relay is unavailable',async({page})=>{
 const customer={orbisIdentityId:'11111111-1111-7111-8111-111111111111',displayId:'ORB-U-23456789'}
 const scope={module:'khata',company:'22222222-2222-4222-8222-222222222222',party:'33333333-3333-4333-8333-333333333333',companyName:'Synthetic shared books',partyName:'Synthetic recipient'}
 const link={...scope,id:'44444444-4444-4444-8444-444444444444',recipient:customer.displayId,status:'accepted',outgoing:false,revision:1,acknowledged:0,resync:false}
 const row={id:'synthetic-bill',date:'2026-11-21',reference:'RELAY-FIXTURE-BILL',kind:'sale',account:'receivable',amount:'120',value:'120'}
 let pending:unknown={revision:1,base:0,patch:{reset:true,scope,upsert:[row],remove:[]}}
 let acknowledgements=0,available=true
 const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST,GET,OPTIONS','access-control-allow-headers':'authorization,content-type','cache-control':'no-store'}
 await page.clock.setFixedTime(new Date('2026-11-21T10:00:00Z'))
 await page.addInitScript(customer=>{
  localStorage.setItem('orbis.central.customer.v1',JSON.stringify({version:1,customer,accessToken:'test.access',refreshToken:'test.refresh',expiresAt:Date.now()+3600000}))
  localStorage.setItem('orbis-khata-ui-language-v1','en')
 },customer)
 await page.route('https://admin.example.test/**',route=>route.fulfill({headers,json:{version:'orbis.customer.v1',customer}}))
 await page.route('https://data.example.test/**',async route=>{
  if(route.request().method()==='OPTIONS'){await route.fulfill({headers,status:204});return}
  if(!available){await route.abort('internetdisconnected');return}
  expect(route.request().headers().authorization).toBe('Bearer test.access')
  const body=route.request().postDataJSON()
  expect(body.version).toBe('orbis.khata.data.v1')
  if(body.operation==='party-sharing'){
   expect(body.input).toEqual({action:'list'});await route.fulfill({headers,json:{data:[]}});return
  }
  expect(new URL(route.request().url()).pathname).toBe('/khata/customer-relay')
  expect(body.operation).toBe('customer-relay');expect(relayCommand(body.input)).toBe(true)
  const command=body.input
  let data:unknown
  switch(command.action){
   case 'list':data=[link];break
   case 'pull':expect(command.id).toBe(link.id);data=pending;break
   case 'ack':{
    expect(command).toEqual({action:'ack',id:link.id,revision:1})
    // Inspect the browser's committed encrypted record at the instant ACK arrives.
    const saved=await page.evaluate(async({actor,id})=>{
     const opening=indexedDB.open('orbis-customer-relay-v1',1)
     const db=await new Promise<IDBDatabase>((resolve,reject)=>{opening.onsuccess=()=>resolve(opening.result);opening.onerror=()=>reject(opening.error)})
     try {
      const request=db.transaction('sealed').objectStore('sealed').get(actor)
      const value=await new Promise<{key:CryptoKey;iv:Uint8Array;data:ArrayBuffer}>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
      const decoded=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(value.iv)},value.key,value.data)
      return JSON.parse(new TextDecoder().decode(decoded)).links[id]
     }finally{db.close()}
    },{actor:customer.orbisIdentityId,id:link.id})
    expect(saved.revision).toBe(1);expect(saved.dataset.rows).toEqual([row])
    acknowledgements++;link.acknowledged=1;pending=null;data={saved:true};break
   }
   default:throw new Error('UNEXPECTED_RELAY_MUTATION')
  }
  await route.fulfill({headers,json:{data}})
 })
 await page.goto('/')
 await expect.poll(()=>acknowledgements).toBe(1)
 expect(pending).toBeNull()
 await page.getByRole('button',{name:/Customer view/}).click()
 await page.getByRole('button',{name:'View saved statement',exact:true}).click()
 await expect(page.getByText(row.reference,{exact:true})).toBeVisible()
 available=false
 await page.reload()
 await page.getByRole('button',{name:'View saved statement',exact:true}).click()
 await expect(page.getByText(row.reference,{exact:true})).toBeVisible()
 expect(acknowledgements).toBe(1)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
