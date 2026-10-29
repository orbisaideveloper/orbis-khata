import { test, expect } from '@playwright/test';
test('bill settings stay collapsed and export the selected Bengali invoice as a PDF', async ({ page }) => {
    test.setTimeout(60000);
    const customer = { orbisIdentityId: '11111111-1111-7111-8111-111111111111', displayId: 'ORB-U-23456789' };
    const company = { id: '22222222-2222-4222-8222-222222222222', name: 'পরীক্ষার দোকান' };
    const party = { id: '33333333-3333-4333-8333-333333333333', company: company.id, name: 'গোপাল ডেইরি', kind: 'supplier', phone: '', email: '', address: '', receivable: '0', payable: '0', credit_limit: null, credit_days: null, opening_amount: '0', opening_side: 'none', opening_date: '', opening_account: 'payable' };
    const item = { id: '44444444-4444-4444-8444-444444444444', company: company.id, name: 'দুধ', unit: 'litre', code: '', default_rate: '5000' };
    const warehouse = { id: '55555555-5555-4555-8555-555555555555', name: 'Main' };
    const headers = { 'access-control-allow-origin': 'http://127.0.0.1:4187', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,authorization' };
    await page.addInitScript(({ customer }) => {
        localStorage.setItem('orbis.central.customer.v1', JSON.stringify({ version: 1, customer, accessToken: 'test.access', refreshToken: 'test.refresh', expiresAt: Date.now() + 3600000 }));
        localStorage.setItem('orbis-khata-ui-language-v1', 'en');
    }, { customer });
    await page.route('https://admin.example.test/**', route => route.fulfill({ headers, json: { version: 'orbis.customer.v1', customer } }));
    let savedBill: Record<string, any> | null = null
  await page.route('https://data.example.test/**', async (route) => {
        if (route.request().method() === 'OPTIONS') {
            await route.fulfill({ status: 204, headers });
            return;
        }
        const { operation, input } = route.request().postDataJSON()
    if(operation==='inventory-post') savedBill=input;
        const results: Record<string, unknown> = {
            companies: [company], masters: { parties: [party], items: [item] },
            report: { balances: {}, ledger_balances: {}, parties: [party], entries: [], count: 0 },
            'inventory-report': { items: [item], warehouses: [warehouse], stocks: [], documents: [], count: 0 },
            'expense-report': { balances: {}, categories: [], bills: [], entries: [], count: 0 },
            workspace: null, 'retired-companies': [], 'party-balance': '0', 'inventory-post': 'saved',
        };
        if(savedBill){const voucher={id:savedBill.id,party_id:party.id,party_name:party.name,kind:'purchase',effective_date:savedBill.date,amount_minor:'10000',debit_account:'purchases',credit_account:'payable',reference:savedBill.reference,note:'',reversed:false};results.report={balances:{},ledger_balances:{payable:{opening:'0',closing:'-6000'}},parties:[party],entries:[{...voucher,id:'old',reversed:true,reverses_id:null},{...voucher,id:'reverse',kind:'reversal',reverses_id:'old',debit_account:'payable',credit_account:'purchases'},voucher,{...voucher,id:'linked',kind:'payment',debit_account:'payable',credit_account:'cash',amount_minor:'4000',note:'Payment with bill',reverses_id:null}],count:4};if(operation==='workspace'&&input.action==='detail')results.workspace={voucher,bill:{...savedBill,total:'10000'},payments:[],company_name:company.name,party_name:party.name,item_names:{[item.id]:item.name}};}
    expect(Object.hasOwn(results, operation)).toBe(true);
        await route.fulfill({ headers, json: { data: results[operation] } });
    });
    await page.goto('/');
    await page.getByRole('button', { name: /Khata Boi.*Open/ }).click();
    await page.getByRole('button', { name: 'Purchase', exact: true }).click();
    await expect(page.getByLabel('Modern')).not.toBeVisible();
    await page.getByText('Bill settings', { exact: true }).click();
    await page.getByLabel('Modern').check();
    await page.getByText('Bill settings', { exact: true }).click();
    await page.getByRole('combobox', { name: 'Party', exact: true }).selectOption(party.id);
    await page.getByLabel('Item name 1', { exact: true }).selectOption(item.id);
    await page.getByLabel('Quantity 1', { exact: true }).click();await page.keyboard.type('2');await expect(page.getByLabel('Quantity 1',{exact:true})).toHaveValue('2');
    await page.getByRole('button', { name: 'Review bill', exact: true }).click();
    await expect(page.locator('.bill-template-modern')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm & save', exact: true }).click();
    await expect(page.getByText('Bill saved.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Prepare bill PDF', exact: true }).click();
    const button = page.getByRole('button', { name: 'Download PDF', exact: true });
    await expect(button).toBeVisible({ timeout: 30000 });
    const downloaded = page.waitForEvent('download');
    await button.click();
    const file = await downloaded;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/u);
    await file.saveAs(test.info().outputPath('bill.pdf'));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await page.getByLabel('More options').click()
  await page.locator('.workspace-menu-panel').getByRole('button',{name:'Ledger',exact:true}).click()
  await page.getByRole('button',{name:new RegExp(party.name+' Party')}).click()
  await expect(page.locator('.professional-ledger tbody tr')).toHaveCount(1)
  await expect(page.locator('.professional-ledger tfoot')).toContainText('₹100.00')
  await expect(page.locator('.professional-ledger tfoot')).toContainText('₹40.00')
  await expect(page.locator('.professional-ledger tfoot')).toContainText('−₹60.00')
  await page.locator('.professional-ledger tbody td:nth-child(2) button').click()
  const dialog=page.getByRole('dialog',{name:'Entry details'})
  await expect(dialog.locator('.record-items table')).toBeVisible()
  const pageBox=await dialog.boundingBox();expect(pageBox?.x).toBe(0);expect(pageBox?.width).toBe(page.viewportSize()?.width)
  await expect(page.locator('.professional-ledger thead th').last()).toHaveText('Actions')
  await expect(page.locator('.professional-ledger tbody td').first()).toHaveText(/\d{2}\.\d{2}\.\d{2}/)
  await expect(dialog.getByLabel('Quantity',{exact:true})).toHaveCount(0)
  expect(await page.evaluate(()=>document.body.style.overflow)).toBe('hidden')
  await dialog.getByRole('button',{name:'Edit',exact:true}).click()
  await expect(dialog.getByLabel('Quantity',{exact:true})).toBeVisible()
  await expect(dialog.locator('fieldset')).toHaveCount(0)
  await expect(dialog.getByLabel('Received / paid',{exact:true})).toBeVisible()
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true)
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden')
  await page.getByRole('button',{name:'Back',exact:true}).click()
  await expect(page.getByRole('heading',{name:'At a glance'})).toBeVisible()
  await page.locator('.kh-brand').click()
  await expect(page.getByRole('heading',{name:'At a glance'})).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
