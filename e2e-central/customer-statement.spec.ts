import {test,expect} from '@playwright/test';
import {shareCopy,type ShareText} from '../src/customer-view/copy';
for(const language of ['en','bn','hi'] as const){
 test(`shared statement refresh, navigation and layout (${language})`,async({page})=>{
 const t=(key:ShareText)=>shareCopy(language,key);
 const customer={orbisIdentityId:'11111111-1111-7111-8111-111111111111',displayId:'ORB-U-23456789'};
 const link={id:'share-fixture',organization:'Statement fixture agency',party:'Statement fixture seller',partyType:'SELLER',recipient:customer.displayId,status:'accepted',outgoing:false};
 let payment='1000';const reads:Record<string,unknown>[]=[];
 const headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization'};
 await page.clock.setFixedTime(new Date('2026-11-02T10:00:00Z'));
 await page.addInitScript(({customer,language})=>{localStorage.setItem('orbis.central.customer.v1',JSON.stringify({version:1,customer,accessToken:'test.access',refreshToken:'test.refresh',expiresAt:Date.now()+3600000}));localStorage.setItem('orbis-khata-ui-language-v1',language);},{customer,language});
 await page.route('https://admin.example.test/**',r=>r.fulfill({headers,json:{version:'orbis.customer.v1',customer}}));
 await page.route('https://data.example.test/**',async route=>{
  if(route.request().method()==='OPTIONS'){await route.fulfill({headers,status:204});return;}
  const {operation,input}=route.request().postDataJSON();expect(operation).toBe('party-sharing');reads.push(input);
  if(input.action==='list'){await route.fulfill({headers,json:{data:[link]}});return;}
  expect(input.action).toBe('statement');expect(input.id).toBe(link.id);
  await route.fulfill({headers,json:{data:{party:link.party,source:link.organization,sourceRole:'Stockist',direction:'pay',from:input.from,to:input.to,opening:'1000',balance:String(3000n-BigInt(payment)),rows:[{id:'sale',date:'2026-10-31',reference:'SALE-FIXTURE',kind:'DRAFT',business:'2000',money:'0',quantity:'12',returned:'2',netQuantity:'10',rate:'200',commission:'0',tds:'0',balance:'3000'},{id:'payment',date:'2026-11-01',reference:'PAYMENT-FIXTURE',kind:'payment',business:'0',money:payment,balance:String(3000n-BigInt(payment)),split:{cashPaise:payment}}],total:2,next:null}}});
 });
 await page.goto('/');await page.getByRole('button',{name:new RegExp(t('title'))}).click();await page.getByRole('button',{name:t('open'),exact:true}).click();
 await expect(page.getByRole('table')).toBeVisible();await expect(page.getByLabel(t('from'),{exact:true})).toHaveValue('2026-10-04');
 await expect(page.getByRole('columnheader',{name:t('unsold')})).toBeVisible();await expect(page.getByText('SALE-FIXTURE',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const table=page.getByRole('region',{name:t('entries')});if((page.viewportSize()?.width??0)<600)expect(await table.evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(true);
 await table.evaluate(e=>{e.scrollLeft=e.scrollWidth;});await expect(page.getByText('PAYMENT-FIXTURE',{exact:true})).toBeAttached();
 await expect(page.getByRole('button',{name:/Save|Edit|Pay ₹/})).toHaveCount(0);
 payment='1500';await page.getByRole('button',{name:t('refresh'),exact:true}).click();await expect(page.getByText('₹15.00',{exact:true})).toHaveCount(2);
 await expect(page.getByText(new RegExp(t('checked')+':'))).toBeVisible();expect(reads.filter(r=>r.action==='statement')).toHaveLength(2);
 await page.screenshot({path:test.info().outputPath('shared-statement.png'),fullPage:true});
 await page.getByRole('button',{name:t('back'),exact:true}).click();await expect(page.getByRole('button',{name:t('open'),exact:true})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:t('open'),exact:true}).click();await expect(page.getByRole('table')).toBeVisible();
 });
}
