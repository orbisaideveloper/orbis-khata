import {test,expect} from '@playwright/test';
test('public policy and deletion paths work without login or data collection',async({page})=>{
 for(const path of ['/privacy.html','/delete-account.html']){
  const response=await page.goto(path);expect(response?.status()).toBe(200);
  expect(response?.headers()['content-type']).toContain('text/html');
  await expect(page.locator('article')).toHaveCount(3);
  await expect(page.locator('form,input,script,iframe')).toHaveCount(0);
  for(const id of ['bn','hi','en']){await page.locator('nav a[href="#'+id+'"]').click();await expect(page.locator('#'+id)).toBeInViewport();}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('a[href^="mailto:"]')).toHaveAttribute('href',/^mailto:orbisaideveloper@gmail.com/);
  await page.reload();await expect(page.locator('h1')).toContainText('Khata Boi');
 }
 await page.goto('/');await expect(page.getByRole('link',{name:'Privacy Policy'})).toBeVisible();
});
