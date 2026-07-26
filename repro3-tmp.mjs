import { chromium } from '@playwright/test';
const URL='http://localhost:8098/HSC-Writing-Master/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type()==='error') errs.push('CONSOLE: ' + m.text().slice(0,300)); });

await page.goto(URL, { waitUntil: 'networkidle' });
await page.fill('#username','user'); await page.fill('#password','user');
await page.click('button[type=submit]');
await page.waitForSelector('input[type=checkbox]', { timeout: 20000 });
await page.check('input[type=checkbox]');
await page.click('button:has-text("Agree and continue")');
await page.waitForTimeout(2000);
await page.keyboard.press('Escape'); await page.waitForTimeout(500);
await page.keyboard.press('Escape'); await page.waitForTimeout(800);

// Load the curriculum library — the state their app has and my earlier repro didn't.
const load = page.locator('button:has-text("Load Curriculum Library")');
if (await load.count()) {
  await load.click();
  await page.waitForTimeout(1500);
  // A manifest-import dialog may ask which docs to bring in.
  const importBtn = page.locator('button:has-text("Import")').first();
  if (await importBtn.count()) { await importBtn.click().catch(()=>{}); }
  await page.waitForTimeout(6000);
}
const afterLoad = (await page.locator('body').innerText().catch(()=>'')).trim();
console.log('after library load len:', afterLoad.length);
console.log('errors so far:', errs.length ? errs.join('\n  ') : '(none)');

errs.length = 0;
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
const body = (await page.locator('body').innerText().catch(()=>'')).trim();
console.log('RETURN VISIT len:', body.length);
console.log('RETURN VISIT text:', JSON.stringify(body.slice(0,120)));
console.log('RETURN VISIT errors:', errs.length ? errs.join('\n  ') : '(none)');
await page.screenshot({ path: '/tmp/claude-0/-home-user-HSC-Writing-Master/f80ee1bf-6c18-51cb-b017-7623893ca301/scratchpad/19-lib-return.png' });
await browser.close();
