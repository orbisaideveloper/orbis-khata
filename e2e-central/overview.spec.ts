import { test, expect } from '@playwright/test';
test('summary cards open due lists and scoped ledgers while the independent Ledger remains available', async ({ page }) => {
    const customer = { orbisIdentityId: '11111111-1111-7111-8111-111111111111', displayId: 'ORB-U-23456789' };
    const company = { id: '22222222-2222-4222-8222-222222222222', name: 'Easy books' };
    const parties = [
        { id: '33333333-3333-4333-8333-333333333333', name: 'Customer A', kind: 'customer', receivable: '1000', payable: '0' },
        { id: '44444444-4444-4444-8444-444444444444', name: 'Customer B', kind: 'customer', receivable: '2000', payable: '0' },
        { id: '55555555-5555-4555-8555-555555555555', name: 'Supplier', kind: 'supplier', receivable: '0', payable: '3000' },
        { id: '66666666-6666-4666-8666-666666666666', name: 'Rent owner', kind: 'expense', receivable: '0', payable: '0' },
    ];
    const receipt = { id: 'receipt', party_id: parties[0].id, party_name: 'Customer A', kind: 'receipt', effective_date: '2026-10-25', amount_minor: '1000', debit_account: 'cash', credit_account: 'receivable', reference: 'R1', note: '', reversed: false };
    const cost = { id: 'payment', kind: 'payment', effective_date: '2026-10-25', category: 'Rent', payee: 'Rent owner', amount: '300', method: 'cash', parent_id: 'cost-bill', reverses_id: null, reference: 'E1', note: '', reversed: false };
    const expenses = { balances: {}, categories: [{ name: 'Rent', amount: '700' }], bills: [{ id: 'cost-bill', effective_date: '2026-10-25', category: 'Rent', payee: 'Rent owner', amount: '2300', due: '2000' }], entries: [cost], count: 1 };
    const headers = { 'access-control-allow-origin': 'http://127.0.0.1:4187', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type,authorization' };
    const requestedParties: string[] = [];
    await page.addInitScript(({ customer }) => {
        localStorage.setItem('orbis.central.customer.v1', JSON.stringify({ version: 1, customer, accessToken: 'test.access', refreshToken: 'test.refresh', expiresAt: Date.now() + 3600000 }));
        localStorage.setItem('orbis-khata-ui-language-v1', 'en');
    }, { customer });
    await page.route('https://admin.example.test/**', route => route.fulfill({ headers, json: { version: 'orbis.customer.v1', customer } }));
    await page.route('https://data.example.test/**', async (route) => {
        if (route.request().method() === 'OPTIONS') {
            await route.fulfill({ status: 204, headers });
            return;
        }
        const { operation, input } = route.request().postDataJSON();
        let data: unknown;
        if (operation === 'companies') {
            data = [company];
        }
        if (operation === 'masters') {
            data = { parties, items: [] };
        }
        if (operation === 'expense-report') {
            data = expenses;
        }
        if (operation === 'inventory-report') {
            data = { items: [{id:'milk',name:'Milk',code:'M1',unit:'litre'}], warehouses: [{id:'main',name:'Main godown'}], stocks: [{item:'milk',warehouse:'main',opening:'0',incoming:'2000000',outgoing:'0',closing:'2000000'}], documents: Array.from({length:20},(_,n)=>({id:'bill'+n,kind:'purchase',date:'2026-10-25',party_name:'Supplier',reference:'P'+n,reversed:false,lines:[{item:'milk',warehouse:'main',to:null,quantity:'1000000',rate:'5000'}]})), count: 20 };
        }
        if (operation === 'report') {
            if (input.party) {
                requestedParties.push(input.party);
            }
            data = { balances: { cash: { opening: '500', movement: '700', closing: '1200' }, expenses: { opening: '0', movement: '700', closing: '700' } }, ledger_balances: { receivable: { opening: '0', closing: '2000' } }, parties, entries: input.party ? [{ ...receipt, id: 'selected', party_id: input.party, reference: 'Party-specific entry' }] : [receipt], count: 1, opening_entries: [] };
        }
        if (operation === 'workspace') {
            data = null;
        }
        if (operation === 'retired-companies') {
            data = [];
        }
        expect(data).toBeDefined();
        await route.fulfill({ headers, json: { data } });
    });
    await page.goto('/');
    await page.getByRole('button', { name: /Khata Boi.*Open/ }).click();
    await expect(page.getByRole('button', { name: 'To receive', exact: true })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('overview-home.png'), fullPage: true });
    await page.getByRole('button', { name: 'To receive', exact: true }).click();
    await expect(page.locator('.overview-ledger-row')).toHaveCount(2);
    await page.screenshot({ path: test.info().outputPath('overview-list.png'), fullPage: true });
    await page.getByRole('button', { name: /Customer B/ }).click();
    await expect(page.getByRole('heading', { name: 'Customer B', exact: true })).toBeVisible();
    await expect(page.getByText('Party-specific entry', { exact: false })).toBeVisible();
    expect(requestedParties).toContain(parties[1].id);
    await page.screenshot({ path: test.info().outputPath('overview-party-ledger.png'), fullPage: true });
    await page.getByRole('button', { name: 'Back to list', exact: true }).click();
    await page.getByRole('button', { name: /Back to home/ }).click();
    await page.getByRole('button', { name: 'To pay', exact: true }).click();
    await expect(page.locator('.overview-ledger-row')).toHaveCount(2);
    await expect(page.getByRole('button', { name: /Rent owner/ })).toBeVisible();
    await page.getByRole('button', { name: /Back to home/ }).click();
    await page.getByRole('button', { name: 'Cash', exact: true }).click();
    await expect(page.getByRole('columnheader', { name: 'Money in', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Customer A', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rent owner', exact: true })).toBeVisible();
    await page.locator('.kh-brand').click();
    await expect(page.getByRole('button', { name: 'To receive', exact: true })).toBeVisible();
    await expect(page.locator('.kh-summary-grid>.kh-metric')).toHaveCount(4);
    await page.getByRole('button',{name:'Cash & Bank',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Cash / Bank',exact:true})).toBeVisible();
    await expect(page.getByRole('columnheader',{name:'Money in',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Back',exact:true}).click();
    await expect(page.getByRole('heading',{name:'At a glance'})).toBeVisible();
    const presetRows=await page.locator('.date-presets button').evaluateAll(els=>els.map(el=>Math.round(el.getBoundingClientRect().top)));expect(new Set(presetRows).size).toBe(1);
    await page.screenshot({path:test.info().outputPath('home-cards.png'),fullPage:true});
    await page.getByRole('button', { name: 'Expense details', exact: true }).click();
    await page.getByRole('button', { name: /Rent/ }).click();
    await expect(page.getByRole('heading', { name: 'Rent', exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('button', { name: 'Ledger', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Customer A Party', exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Search by name or item code')).toBeVisible();
    await page.getByRole('combobox',{name:'Ledger',exact:true}).selectOption('party');
    await page.getByPlaceholder('Search by name or item code').fill('Customer');
    await expect(page.locator('.ledger-results .ledger-row')).toHaveCount(2);
    await page.locator('.ledger-explorer').evaluate(el=>el.style.minHeight='1500px');
    await page.evaluate(()=>window.scrollTo(0,500));
    await expect.poll(()=>page.locator('.kh-app-header').evaluate(el=>Math.round(el.getBoundingClientRect().top))).toBe(0);
    await page.getByLabel('More options').click();
    const menu=page.locator('.workspace-menu-panel');
    await expect(menu).toBeVisible();
    expect(await menu.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})).toBe(true);
    await page.screenshot({path:test.info().outputPath('compact-search-sticky-menu.png'),fullPage:true});
    await page.getByLabel('More options').click();
    await page.locator('.ledger-explorer').evaluate(el=>el.style.minHeight='');
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.getByRole('combobox',{name:'Ledger',exact:true}).selectOption('item');
    await page.getByPlaceholder('Search by name or item code').fill('M1');
    await page.getByRole('button',{name:'Milk · M1 Item',exact:true}).click();
    await expect(page.locator('.item-movements tbody tr')).toHaveCount(20);
    await expect(page.getByRole('columnheader',{name:'Quantity',exact:true})).toBeVisible();
    expect(await page.locator('.item-movements').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
    await page.screenshot({path:test.info().outputPath('compact-item-statement.png'),fullPage:true});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
