import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  page.on('request', request => {
    if (request.url().includes('/api/v1/')) {
      console.log(`[API REQUEST] ${request.method()} ${request.url()}`);
    }
  });

  page.on('response', async response => {
    if (response.url().includes('/api/v1/')) {
      let bodyText = '';
      try { bodyText = await response.text(); } catch (e) {}
      console.log(`[API RESPONSE] ${response.status()} ${response.url()} -> ${bodyText.slice(0, 100)}`);
    }
  });

  try {
    console.log('Navigating to login page...');
    await page.goto('http://localhost:4000/login', { waitUntil: 'networkidle2' });

    console.log('Logging in as child1...');
    await page.type('#username', 'child1');
    await page.type('#password', 'password123');
    await page.click('#login-btn');

    console.log('Waiting for navigation...');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    console.log('Current URL:', page.url());

    // Check if we are still on login page
    const errorEl = await page.$('#login-error');
    if (errorEl) {
      const errorMsg = await page.evaluate(el => el.textContent, errorEl);
      const isHidden = await page.evaluate(el => el.hidden, errorEl);
      if (!isHidden) {
        console.log('Login error displayed:', errorMsg);
      }
    }

    console.log('Taking dashboard/login screenshot...');
    await page.screenshot({ path: 'scratch/dashboard_child.png' });

  } catch (error) {
    console.error('Test failed with error:', error);
  } finally {
    await browser.close();
  }
})();
