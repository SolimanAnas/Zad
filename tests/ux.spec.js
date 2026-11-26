// UI floor: touch targets of at least 44 px on the controls used most, and readable text on
// the selected states in every theme (light, dark, sepia).
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:8080';
test.use({ serviceWorkers: 'block', viewport: { width: 375, height: 760 } });

test.beforeEach(async ({ page }) => {
  await page.route(url => !url.href.startsWith(BASE_URL), route => route.abort());
});

const TARGETS = ['#vmModeTabs [data-mode="short"]', '#vmModeTabs [data-mode="long"]', '#vmSearchBtn', '#vmPopularBtn',
  '#vmSurahBtn', '.stepper button', '#vmReciterBtn', '#vmSource [data-src="own"]', '#vmFormat button',
  '#vmTextFx button', '#vmPreview', '#vmExport', '.header .icon-btn'];

test('the main controls are at least 44 px tall', async ({ page }) => {
  await page.goto(`${BASE_URL}/pages/video-maker.html`, { waitUntil: 'load' });
  await expect(page.locator('#vmSurahLabel')).not.toBeEmpty({ timeout: 20000 });
  for (const sel of TARGETS) {
    const box = await page.locator(sel).first().boundingBox();
    expect(box, sel).not.toBeNull();
    expect(box.height, sel + ' height').toBeGreaterThanOrEqual(44);
    expect(box.width, sel + ' width').toBeGreaterThanOrEqual(40);
  }
  // the tab labels stay on one line on a small phone
  for (const sel of ['#vmModeTabs [data-mode="short"]', '#vmModeTabs [data-mode="long"]']) {
    const h = await page.locator(sel + ' span').evaluate(el => el.getBoundingClientRect().height);
    expect(h, sel).toBeLessThan(26);
  }
});

for (const theme of ['light', 'dark', 'sepia']) {
  test(`selected states are readable (${theme})`, async ({ page }) => {
    await page.addInitScript(t => { localStorage.setItem('themeMode', t); }, theme);
    await page.goto(`${BASE_URL}/pages/video-maker.html`, { waitUntil: 'load' });
    await expect(page.locator('#vmSurahLabel')).not.toBeEmpty({ timeout: 20000 });
    const ratios = await page.evaluate(() => {
      const rgb = s => s.match(/[\d.]+/g).slice(0, 3).map(Number);
      const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; const [r, g, b] = c.map(f); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
      const pair = sel => { const cs = getComputedStyle(document.querySelector(sel)); return ratio(rgb(cs.color), rgb(cs.backgroundColor)); };
      return {
        tab: pair('#vmModeTabs button.active'),
        cta: pair('#vmExport'),
        // the number sits on a light tint of the card: measure against the card itself
        step: ratio(rgb(getComputedStyle(document.querySelector('.step-num')).color), rgb(getComputedStyle(document.querySelector('.step-num').closest('.card')).backgroundColor)),
      };
    });
    expect(ratios.tab, 'active tab').toBeGreaterThanOrEqual(4.5);
    expect(ratios.cta, 'create button').toBeGreaterThanOrEqual(4.5);
    expect(ratios.step, 'step number').toBeGreaterThanOrEqual(4.5);
  });
}
