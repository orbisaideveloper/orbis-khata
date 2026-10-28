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
    await page.route('https://data.example.test/**', async (route) => {
        if (route.request().method() === 'OPTIONS') {
            await route.fulfill({ status: 204, headers });
            return;
        }
        const { operation } = route.request().postDataJSON();
        const results: Record<string, unknown> = {
            companies: [company], masters: { parties: [party], items: [item] },
            report: { balances: {}, ledger_balances: {}, parties: [party], entries: [], count: 0 },
            'inventory-report': { items: [item], warehouses: [warehouse], stocks: [], documents: [], count: 0 },
            'expense-report': { balances: {}, categories: [], bills: [], entries: [], count: 0 },
            workspace: null, 'retired-companies': [], 'party-balance': '0', 'inventory-post': 'saved',
        };
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
    await page.getByLabel('Quantity 1', { exact: true }).fill('2');
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
