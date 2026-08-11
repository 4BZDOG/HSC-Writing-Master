import { chromium } from '@playwright/test';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await p.fill('#username','user'); await p.fill('#password','user'); await p.click('button[type=submit]');
const agree = p.getByRole('button', { name: /agree and continue/i });
await agree.waitFor({state:'visible',timeout:25000}).catch(()=>{});
if (await agree.count()) { await p.getByRole('checkbox').first().check(); await agree.click(); await agree.waitFor({state:'hidden',timeout:15000}).catch(()=>{}); }
await p.waitForTimeout(4000);
const look = async (label) => {
  const info = await p.evaluate(() => {
    const el = [...document.querySelectorAll('span.text-\\[9px\\].font-bold')].find(e => /^[0-9!]+$/.test(e.textContent.trim()));
    if (!el) return 'not found';
    const cs = getComputedStyle(el);
    const parent = getComputedStyle(el.parentElement);
    return { text: el.textContent.trim(), cls: el.className, color: cs.color, parentBg: parent.backgroundColor, parentCls: parent.length ? el.parentElement.className.slice(0,80) : '' };
  });
  console.log(label, JSON.stringify(info));
};
await look('dark ');
await p.getByRole('button', { name: /switch to light theme/i }).click();
await p.waitForTimeout(900);
await look('light');
await b.close();
