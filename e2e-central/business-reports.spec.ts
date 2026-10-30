import {test,expect} from '@playwright/test';
test('daily report reconciles bills, credit profit and cash/bank payments without horizontal overflow',async({page})=>{
 test.setTimeout(60000);
 const customer={orbisIdentityId:'11111111-1111-7111-8111-111111111111',displayId:'ORB-U-23456789'},company={id:'22222222-2222-4222-8222-222222222222',name:'Report shop'};
 const day='2026-10-29',party={id:'33333333-3333-4333-8333-333333333333',name:'Trader',kind:'both',receivable:'6000',payable:'7000'},item={id:'44444444-4444-4444-8444-444444444444',name:'Milk',unit:'litre',code:'M'};
 const purchase={id:'55555555-5555-4555-8555-555555555555',kind:'purchase',company:company.id,date:day,reference:'1',total:'10000',reversed:false,party:party.id,party_name:party.name,lines:[{item:item.id,warehouse:'w',to:null,quantity:'10000000',rate:'1000'}]};
 const sale={...purchase,id:'66666666-6666-4666-8666-666666666666',kind:'sale',reference:'2',total:'8000',lines:[{...purchase.lines[0],quantity:'4000000',rate:'2000'}]};
 const entry={id:purchase.id,party_id:party.id,party_name:party.name,effective_date:day,kind:'purchase',amount_minor:'10000',reference:'1',debit_account:'purchases',credit_account:'payable',reversed:false,note:''};
 const trade={balances:{cash:{opening:'0',movement:'-1000',closing:'-1000'},bank:{opening:'0',movement:'-500',closing:'-500'}},ledger_balances:{},parties:[party],entries:[entry,{...entry,id:sale.id,kind:'sale',reference:'2',amount_minor:'8000',debit_account:'receivable',credit_account:'sales'},{...entry,id:'r',kind:'receipt',amount_minor:'2000',debit_account:'cash',credit_account:'receivable'},{...entry,id:'p',kind:'payment',amount_minor:'3000',debit_account:'payable',credit_account:'cash'}],count:4,as_of:day};
 const expenses={balances:{expenses:{opening:'0',movement:'500',closing:'500'}},categories:[],bills:[],entries:[{id:'e',kind:'charge',amount:'500',effective_date:day,payee:'Rent owner',category:'Rent',method:'bank',reversed:false,reference:'E1',note:'',parent_id:null,reverses_id:null}],count:1};
 const headers={'access-control-allow-origin':'http://127.0.0.1:4187','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization'};
 await page.clock.setFixedTime(new Date('2026-10-29T10:00:00Z'));
 await page.addInitScript(customer=>{localStorage.setItem('orbis.central.customer.v1',JSON.stringify({version:1,customer,accessToken:'test.access',refreshToken:'test.refresh',expiresAt:Date.now()+3600000}));localStorage.setItem('orbis-khata-ui-language-v1','en');},customer);
 await page.route('https://admin.example.test/**',r=>r.fulfill({headers,json:{version:'orbis.customer.v1',customer}}));
 await page.route('https://data.example.test/**',async route=>{
  if(route.request().method()==='OPTIONS'){await route.fulfill({headers,status:204});return;}
  const {operation,input}=route.request().postDataJSON();let data:unknown;
  if(operation==='companies')data=[company];
  if(operation==='masters')data={parties:[party],items:[item]};
  if(operation==='report')data=trade;
  if(operation==='expense-report')data=expenses;
  if(operation==='inventory-report')data={items:[item],warehouses:[],stocks:[],documents:[purchase,sale],count:2};
  if(operation==='workspace')data=input.action==='accounts'?[{id:'cash',name:'Cash',kind:'cash',balance:'-1000',entry_ids:['r','p']},{id:'bank',name:'Bank',kind:'bank',balance:'-500',entry_ids:[]}]:null;
  if(operation==='expense-post'){expect(input).toMatchObject({category:'Salary › Permanent',payee:'Arko',amount:'15000',method:'bank'});expenses.entries.push({...expenses.entries[0],...input,effective_date:input.date,parent_id:null,reverses_id:null,reversed:false});expenses.count++;data=input.id;}
  if(operation==='retired-companies')data=[];
  expect(data).toBeDefined();await route.fulfill({headers,json:{data}});
 });
 await page.goto('/');await page.getByRole('button',{name:/Khata Boi.*Open/}).click();
 await page.getByRole('button',{name:/Daily summary/}).click();await page.getByRole('button',{name:'Today',exact:true}).click();
 const report=page.getByRole('region',{name:'Business reports'});await expect(report.getByText('Net profit / loss')).toBeVisible();await expect(report.locator('.profit-total')).toHaveText('Net profit / loss₹35.00');
 await page.screenshot({path:test.info().outputPath('daily-profit.png'),fullPage:true});
 await report.getByRole('button',{name:'Bill register'}).click();await expect(report.locator('.report-count')).toContainText('Bill count: 3');
 await report.getByLabel('Type').selectOption('sale');await expect(report.locator('tbody tr')).toHaveCount(1);await expect(report.locator('.report-count')).toContainText('₹80.00');
 await report.getByRole('button',{name:'Money in / out'}).click();await report.getByLabel('Show').selectOption('out');await expect(report.locator('tbody tr')).toHaveCount(2);await expect(report.locator('tfoot')).toContainText('₹35.00');
 expect(await report.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);await page.screenshot({path:test.info().outputPath('payments.png'),fullPage:true});
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Home',exact:true}).click();await page.getByRole('button',{name:'Bank',exact:true}).click();await expect(page.locator('.overview-transactions')).toContainText('Rent owner');await expect(page.getByText('Account details unavailable.')).toHaveCount(0);
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Home',exact:true}).click();await page.getByLabel('More options').click();await page.locator('.workspace-menu-panel').getByRole('button',{name:'Expenses',exact:true}).click();const expenseForm=page.getByRole('region',{name:'Business expenses',exact:true});await expect(expenseForm.getByLabel('Category',{exact:true})).toBeVisible();await expect(expenseForm.getByRole('columnheader',{name:'Quantity',exact:true})).toHaveCount(0);await expenseForm.getByLabel('Category',{exact:true}).fill('Salary');await expenseForm.getByLabel('Subcategory',{exact:true}).fill('Permanent');await expenseForm.getByLabel('Paid to / owed to',{exact:true}).fill('Arko');await expenseForm.getByLabel('Amount',{exact:true}).fill('150');await expenseForm.getByLabel('Settlement',{exact:true}).selectOption('bank');await expenseForm.getByLabel('Description / correction reason',{exact:true}).fill('October salary');await page.screenshot({path:test.info().outputPath('simple-expense.png'),fullPage:true});await expenseForm.getByRole('button',{name:'Review',exact:true}).click();await expenseForm.getByRole('button',{name:'Confirm',exact:true}).click();await expect(expenseForm.getByText('Expense records saved.',{exact:true})).toBeVisible();await expect(expenseForm.getByRole('table').getByText('Arko',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(await expenseForm.locator('.expense-statement').evaluate(el=>el.scrollWidth>el.clientWidth||innerWidth>900)).toBe(true);await page.reload();await page.getByLabel('More options').click();await page.locator('.workspace-menu-panel').getByRole('button',{name:'Expenses',exact:true}).click();await expect(page.getByRole('table').getByText('Arko',{exact:true})).toBeVisible();
});
