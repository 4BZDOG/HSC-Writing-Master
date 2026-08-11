import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1500, height: 950 } });
await p.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await p.fill('#username','user'); await p.fill('#password','user'); await p.click('button[type=submit]');
const agree = p.getByRole('button', { name: /agree and continue/i });
await agree.waitFor({state:'visible',timeout:25000}).catch(()=>{});
if (await agree.count()) { await p.getByRole('checkbox').first().check(); await agree.click(); await agree.waitFor({state:'hidden',timeout:15000}).catch(()=>{}); }
await p.waitForTimeout(2500);
const info = await p.evaluate(() => {
  const el = [...document.querySelectorAll('*')].find(e => e.textContent?.trim() === 'HSC Writing Coach');
  const chain = [];
  let n = el;
  for (let i = 0; i < 6 && n; i++) {
    const cs = getComputedStyle(n);
    chain.push({ tag: n.tagName, cls: (n.className || '').toString().slice(0, 70), bg: cs.backgroundColor, bgImg: cs.backgroundImage.slice(0, 40) });
    n = n.parentElement;
  }
  return { chain, hasHeader: !!document.querySelector('header'), hasMain: !!document.querySelector('main') };
});
console.log(JSON.stringify(info, null, 1));
await b.close();
