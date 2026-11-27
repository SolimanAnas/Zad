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
  '#vmTextFx button', '#vmPreview', '#vmExport', '.header .icon-btn', '#vmThemeBtn'];

test('opens dark by default, and the header button switches to light and back', async ({ page }) => {
  await page.goto(`${BASE_URL}/pages/video-maker.html`, { waitUntil: 'load' });
  await expect(page.locator('#vmSurahLabel')).not.toBeEmpty({ timeout: 20000 });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#vmThemeBtn')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#vmThemeBtn').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#vmThemeBtn')).toHaveAttribute('aria-pressed', 'false');
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');     // remembered
  // the bundled fonts: Cairo for titles and buttons, Tajawal for the text you read
  const f = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      cairo: document.fonts.check('700 16px "Cairo"', 'الآيات'),
      tajawal: document.fonts.check('500 14px "Tajawal"', 'الآيات'),
      title: getComputedStyle(document.querySelector('.step-title')).fontFamily,
      button: getComputedStyle(document.querySelector('#vmExport')).fontFamily,
      label: getComputedStyle(document.querySelector('.controls-col .label')).fontFamily,
    };
  });
  expect(f.cairo).toBe(true);
  expect(f.tajawal).toBe(true);
  expect(f.title.startsWith('Cairo')).toBe(true);
  expect(f.button.startsWith('Cairo')).toBe(true);
  expect(f.label.startsWith('Tajawal')).toBe(true);
});

test('the main controls are at least 44 px tall', async ({ page }) => {
  // (the theme button joins the header's language button)
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
        // secondary text (field labels) on the section it sits on
        label: ratio(rgb(getComputedStyle(document.querySelector('.controls-col .label')).color), rgb(getComputedStyle(document.querySelector('.controls-col .label').closest('.card')).backgroundColor)),
        // the selected format: accent text on the field it sits on
        format: ratio(rgb(getComputedStyle(document.querySelector('#vmFormat button.active')).color), rgb(getComputedStyle(document.querySelector('#vmFormat button:not(.active)')).backgroundColor)),
      };
    });
    expect(ratios.tab, 'active tab').toBeGreaterThanOrEqual(4.5);
    expect(ratios.cta, 'create button').toBeGreaterThanOrEqual(4.5);
    expect(ratios.label, 'field labels').toBeGreaterThanOrEqual(4.5);
    expect(ratios.format, 'selected format').toBeGreaterThanOrEqual(4.5);
  });
}
