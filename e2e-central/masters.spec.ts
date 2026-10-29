import {test,expect} from '@playwright/test'
test('cloud masters survive reload and require two delete confirmations',async({page})=>{
 test.setTimeout(60000)
 const customer={orbisIdentityId:'11111111-1111-7111-8111-111111111111',displayId:'ORB-U-23456789'}
 const company={id:'22222222-2222-4222-8222-222222222222',name:'Cloud trial'}
 let parties:Record<string,unknown>[]=[],items:Record<string,unknown>[]=[];let deletes=0
 const headers={'access-control-allow-origin':'http://127.0.0.1:4187','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization'}
 await page.addInitScript(({customer})=>{localStorage.setItem('orbis.central.customer.v1',JSON.stringify({version:1,customer,accessToken:'test.access',refreshToken:'test.refresh',expiresAt:Date.now()+3600000}));localStorage.setItem('orbis-khata-ui-language-v1','en')},{customer})
 await page.route('https://admin.example.test/**',route=>route.fulfill({headers,json:{version:'orbis.customer.v1',customer}}))
 await page.route('https://data.example.test/**',async route=>{
  if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return}
  const {operation,input}=route.request().postDataJSON();let data:unknown=null
  if(operation==='companies')data=[company,{id:'77777777-7777-4777-8777-777777777777',name:'Second company'}]
  if(operation==='expense-report')data={balances:{},categories:[],bills:[],entries:[],count:0}
  if(operation==='masters')data={parties,items}
  if(operation==='report')data={balances:{},ledger_balances:{},parties,entries:[],count:0,as_of:'2026-10-26'}
  if(operation==='inventory-report')data={items,warehouses:[],stocks:[],documents:[],count:0}
  if(operation==='party-save'){parties=[input];data=input.id}
  if(operation==='item-save'){items=[input];data=input.id}
  if(operation==='party-delete'){parties=[];deletes++}
  await route.fulfill({headers,json:{data}})
 })
 await page.goto('/');await page.getByRole('button',{name:/Khata Boi.*Open/}).click()
 await expect(page.getByRole('combobox',{name:'Company',exact:true})).toContainText('Cloud trial')
 await page.getByRole('combobox',{name:'Company',exact:true}).selectOption('77777777-7777-4777-8777-777777777777');await page.reload();await expect(page.getByRole('heading',{name:'At a glance'})).toBeVisible();await expect(page.getByRole('combobox',{name:'Company',exact:true})).toHaveValue('77777777-7777-4777-8777-777777777777');
 const nav=page.locator('.workspace-menu-panel')
 await page.getByRole('button',{name:'Parties 0',exact:true}).click();await page.getByRole('button',{name:'＋ Add party',exact:true}).click()
 await page.getByLabel('Name',{exact:true}).fill('Cloud customer');await page.getByLabel('Phone number',{exact:true}).fill('+919876543210');await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByText('Cloud customer',{exact:true})).toBeVisible()
 await page.reload();await expect(page.getByRole('heading',{name:'At a glance'})).toBeVisible();await page.getByRole('button',{name:'Parties 1',exact:true}).click();await expect(page.getByRole('link',{name:'+919876543210',exact:true})).toHaveAttribute('href','tel:+919876543210'); await expect(page.getByRole('columnheader',{name:'Party name',exact:true})).toBeVisible(); await expect(page.getByRole('columnheader',{name:'Category',exact:true})).toBeVisible(); await page.screenshot({path:test.info().outputPath('parties.png'),fullPage:true})
 await page.getByRole('button',{name:'More',exact:true}).click();await nav.getByRole('button',{name:'Items',exact:true}).click();await page.getByRole('button',{name:'＋ Add item',exact:true}).click();await page.getByLabel('Name',{exact:true}).fill('Cloud milk');await page.getByLabel('Unit',{exact:true}).fill('litre');await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByText('Cloud milk',{exact:true})).toHaveCount(1);expect(items[0]).toMatchObject({code:'',default_rate:null}); await expect(page.getByRole('columnheader',{name:'Unit',exact:true})).toBeVisible(); await expect(page.getByRole('button',{name:'Edit: Cloud milk',exact:true})).toHaveText(''); await page.screenshot({path:test.info().outputPath('items.png'),fullPage:true})
 await page.getByRole('button',{name:'More',exact:true}).click();await nav.getByRole('button',{name:'Parties',exact:true}).click();const remove=page.getByRole('button',{name:'Delete: Cloud customer',exact:true})
 page.once('dialog',d=>d.dismiss());await remove.click();expect(deletes).toBe(0)
 let count=0;const cancelSecond=async(d:import('@playwright/test').Dialog)=>{if(++count===1)await d.accept();else await d.dismiss()};page.on('dialog',cancelSecond);await remove.click();page.off('dialog',cancelSecond);expect(count).toBe(2);expect(deletes).toBe(0)
 const accept=async(d:import('@playwright/test').Dialog)=>{await d.accept()};page.on('dialog',accept);await remove.click();await expect(page.getByText('Cloud customer',{exact:true})).toHaveCount(0);page.off('dialog',accept);expect(deletes).toBe(1)
 await page.reload();await expect(page.getByRole('heading',{name:'At a glance'})).toBeVisible();await page.getByRole('button',{name:'More',exact:true}).click();await nav.getByRole('button',{name:'Items',exact:true}).click();await expect(page.getByText('Cloud milk',{exact:true})).toHaveCount(1);await page.getByRole('button',{name:'More',exact:true}).click();await nav.getByRole('button',{name:'Parties',exact:true}).click();await expect(page.getByText('Cloud customer',{exact:true})).toHaveCount(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
})
