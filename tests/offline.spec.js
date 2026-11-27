// The app works offline after the first visit: the service worker precaches the page,
// scripts, fonts and Quran text, so a reload with no connection still opens the maker.
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:8080';

test('after the first visit the page opens with no connection', async ({ page, context }) => {
  await page.route(url => !url.href.startsWith(BASE_URL), route => route.abort());
  await page.goto(`${BASE_URL}/pages/video-maker.html`, { waitUntil: 'load' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).length)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(async () => {
    const c = await caches.open('qvm-v12');
    return !!(await c.match('/data/quran.json')) && !!(await c.match('/js/video-maker-long.js'));
  })).toBe(true);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#vmSurahLabel')).not.toBeEmpty({ timeout: 20000 });
  await expect(page.locator('#vmModeTabs [data-mode="long"]')).toBeVisible();
  await page.locator('#vmModeTabs [data-mode="long"]').click();
  await expect(page.locator('#vmTemplates .tpl-thumb')).toHaveCount(14);
});
