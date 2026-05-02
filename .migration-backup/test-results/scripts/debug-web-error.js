const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleMessages = [];
  page.on('console', (msg) => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });
  const pageErrors = [];
  page.on('pageerror', (e) => {
    pageErrors.push({ message: e.message, stack: e.stack });
  });

  await page.goto('https://buildtogether-v2.vercel.app/app/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);

  console.log('=== Console messages ===');
  for (const m of consoleMessages.slice(-30)) console.log(m);
  console.log('\n=== Page errors ===');
  for (const e of pageErrors) {
    console.log(e.message);
    if (e.stack) console.log(e.stack.split('\n').slice(0, 12).join('\n'));
    console.log('---');
  }

  // Check what's in the DOM root
  const rootHtml = await page.evaluate(() => {
    const root = document.getElementById('root');
    return root ? (root.innerHTML.length > 200 ? root.innerHTML.slice(0, 200) + '...' : root.innerHTML) : 'no #root';
  });
  console.log('\n=== Root contents ===');
  console.log(rootHtml);

  await browser.close();
})();
