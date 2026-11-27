// UI floor: touch targets of at least 44 px on the controls used most, and readable text on
// the selected states in every theme (light, dark, sepia).
const { test, expect } = require('@playwright/test');
// the settings are in tabs (الآيات / الصوت / المظهر / النص): open the one a control is on
const sec = (page, name) => expect(async () => {
  const tab = page.locator('#vmTab-' + name);
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click({ timeout: 2000 });
  await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 500 });
}).toPass({ timeout: 15000 });

const BASE_URL = 'http://localhost:8080';
test.use({ serviceWorkers: 'block', viewport: { width: 375, height: 760 } });

test.beforeEach(async ({ page }) => {
  await page.route(url => !url.href.startsWith(BASE_URL), route => route.abort());
});

const TARGETS = ['#vmModeTabs [data-mode="short"]', '#vmModeTabs [data-mode="long"]', '#vmSearchBtn', '#vmPopularBtn',
  '#vmSurahBtn', '.stepper button', '#vmReciterBtn', '#vmSource [data-src="own"]', '#vmFormat button',
  '#vmTextFx button', '#vmPreview', '#vmExport', '.header .icon-btn', '#vmThemeBtn', '#vmSecTabs [role="tab"]'];

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
  const SEC = { '#vmSearchBtn': 'ayat', '#vmPopularBtn': 'ayat', '#vmSurahBtn': 'ayat', '.stepper button': 'ayat',
    '#vmReciterBtn': 'audio', '#vmSource [data-src="own"]': 'audio', '#vmFormat button': 'text', '#vmTextFx button': 'text' };
  for (const sel of TARGETS) {
    if (SEC[sel]) await sec(page, SEC[sel]);
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

// Sheets are real dialogs for the keyboard and screen readers: named by their title, focus
// moves in when one opens, Tab stays inside, Escape closes it, focus goes back to its button.
test('sheets: focus in, Tab kept inside, Escape closes, focus returns', async ({ page }) => {
  await page.goto(`${BASE_URL}/pages/video-maker.html`, { waitUntil: 'load' });
  await expect(page.locator('#vmSurahLabel')).not.toBeEmpty({ timeout: 20000 });
  for (const id of ['vmSurahSheet', 'vmSearchSheet', 'vmPopularSheet', 'vmRecSheet', 'vmSyncSheet', 'vmReciterSheet', 'vmResult']) {
    const named = await page.evaluate(i => { const d = document.getElementById(i); const t = document.getElementById(d.getAttribute('aria-labelledby')); return !!(t && t.textContent.trim()); }, id);
    expect(named, id + ' is named by its title').toBe(true);
  }
  await sec(page, 'ayat');
  await page.locator('#vmSurahBtn').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#vmSurahSheet')).toHaveClass(/active/);
  await expect(page.locator('#vmSurahSheetTitle')).toBeFocused();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('#vmSurahSheet'))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('#vmSurahSheet')).not.toHaveClass(/active/);
  await expect(page.locator('#vmSurahBtn')).toBeFocused();
});

test('every control has a name, and nothing is wider than a 320 px phone', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto(`${BASE_URL}/pages/video-maker.html`, { waitUntil: 'load' });
  await expect(page.locator('#vmSurahLabel')).not.toBeEmpty({ timeout: 20000 });
  await sec(page, 'look');
  await expect(page.locator('#vmBgs [data-bg]').first()).toBeVisible();
  const r = await page.evaluate(() => {
    const name = el => (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent) ||
      el.textContent || el.title || (el.labels && el.labels[0] && el.labels[0].textContent) || '').trim();
    const unnamed = [...document.querySelectorAll('button, a[href], input:not([type=hidden]):not([type=file]), select:not([hidden]), textarea')]
      .filter(el => !name(el)).map(el => el.id || el.className || el.outerHTML.slice(0, 60));
    const pressed = [...document.querySelectorAll('#vmBgs [data-bg]')].filter(b => b.getAttribute('aria-pressed') === 'true').length;
    // the sync sheet's buttons at this width (the sheet is laid out even while closed)
    const nav = document.getElementById('vmSyncNext').closest('.sf-nav');
    document.getElementById('vmSyncSheet').classList.add('active');
    const navRight = Math.max(...[...nav.children].map(b => b.getBoundingClientRect().right));
    const navLeft = Math.min(...[...nav.children].map(b => b.getBoundingClientRect().left));
    document.getElementById('vmSyncSheet').classList.remove('active');
    return { unnamed, pressed, page: document.documentElement.scrollWidth, W: document.documentElement.clientWidth, navLeft, navRight };
  });
  expect(r.unnamed).toEqual([]);
  expect(r.pressed).toBe(1);
  expect(r.page).toBeLessThanOrEqual(r.W);
  expect(r.navLeft).toBeGreaterThanOrEqual(0);
  expect(r.navRight).toBeLessThanOrEqual(r.W);
});

// The preview stays in sight on a phone: once it scrolls away, a live copy sits in the top
// corner; tapping it (or «معاينة») brings the preview back.
test('mini preview while editing, and the text controls say what they are set to', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('m')) { sessionStorage.setItem('m', '1'); localStorage.setItem('zad_lang', 'ar'); localStorage.removeItem('vm_settings'); } });
  await page.goto(`${BASE_URL}/pages/video-maker.html`, { waitUntil: 'load' });
  await expect(page.locator('#vmSurahLabel')).not.toBeEmpty({ timeout: 20000 });
  await expect(page.locator('#vmMini')).toBeHidden();
  await sec(page, 'ayat');
  await expect(page.locator('#vmAyahCount')).toHaveText('٧ آيات');
  await sec(page, 'text');
  await page.locator('#vmFont').scrollIntoViewIfNeeded();
  await expect(page.locator('#vmMini')).toBeVisible();
  // it is the video: not blank
  await expect.poll(() => page.evaluate(() => {
    const c = document.getElementById('vmMiniCanvas'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
    return s / (d.length / 4);
  })).toBeGreaterThan(20);
  // text size shows its value; reset brings the style back
  await sec(page, 'text');
  await expect(page.locator('#vmFontVal')).toHaveText('١٠٠٪');
  await sec(page, 'text');
  await page.locator('#vmFont').fill('1.3');
  await sec(page, 'text');
  await expect(page.locator('#vmFontVal')).toHaveText('١٣٠٪');
  await sec(page, 'text');
  await page.locator('#vmTextFx [data-fx="none"]').click();
  await sec(page, 'text');
  await expect(page.locator('#vmHaloField')).toBeHidden();                 // nothing to colour
  await sec(page, 'text');
  await page.locator('#vmStyleReset').click();
  await sec(page, 'text');
  await expect(page.locator('#vmFontVal')).toHaveText('١٠٠٪');
  await sec(page, 'text');
  await expect(page.locator('#vmTextFx [data-fx="strokeglow"]')).toHaveClass(/active/);
  await sec(page, 'text');
  await expect(page.locator('#vmHaloField')).toBeVisible();
  // colours are named, not hex codes
  await sec(page, 'text');
  await expect(page.locator('#vmColors [data-color="#e6c068"]')).toHaveAttribute('aria-label', 'ذهبي');
  // back to the preview
  await page.locator('#vmMini').click();
  await expect(page.locator('#vmMini')).toBeHidden({ timeout: 5000 });
  await expect.poll(() => page.evaluate(() => { const r = document.getElementById('vmStage').getBoundingClientRect(); return r.top >= -1 && r.top < innerHeight; })).toBe(true);
  // one range count rule for Arabic: 1, 2, 3–10, 11+
  await sec(page, 'ayat');
  await page.fill('#vmTo', '1'); await page.locator('#vmTo').dispatchEvent('change');
  await sec(page, 'ayat');
  await expect(page.locator('#vmAyahCount')).toHaveText('آية واحدة');
  await sec(page, 'ayat');
  await page.fill('#vmTo', '2'); await page.locator('#vmTo').dispatchEvent('change');
  await sec(page, 'ayat');
  await expect(page.locator('#vmAyahCount')).toHaveText('آيتان');
});

test('each colour row fits on one line on a phone', async ({ page }) => {
  await page.goto(`${BASE_URL}/pages/video-maker.html`, { waitUntil: 'load' });
  await expect(page.locator('#vmSurahLabel')).not.toBeEmpty({ timeout: 20000 });
  for (const row of ['#vmColors', '#vmHalos']) {
    const tops = await page.locator(row + ' > *').evaluateAll(els => [...new Set(els.map(e => Math.round(e.getBoundingClientRect().top)))]);
    expect(tops.length, row).toBe(1);
  }
});

// The settings are four tabs: one part at a time, any order, arrow keys move between them,
// and the create bar stays whichever is open.
test('section tabs: one part at a time, in any order, by touch or keyboard', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', '1'); localStorage.setItem('zad_lang', 'ar'); localStorage.removeItem('vm_settings'); } });
  await page.goto(`${BASE_URL}/pages/video-maker.html`, { waitUntil: 'load' });
  await expect(page.locator('#vmSurahLabel')).not.toBeEmpty({ timeout: 20000 });
  const shown = () => page.evaluate(() => [...document.querySelectorAll('.controls-col > section[data-sec]')]
    .filter(s => s.getClientRects().length).map(s => s.dataset.sec));
  expect(await shown()).toEqual(['ayat']);
  await page.locator('#vmTab-text').click();                                  // straight to the last one
  expect(await shown()).toEqual(['text']);
  await expect(page.locator('#vmTab-text')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#vmExport')).toBeVisible();
  // keyboard: in Arabic the next tab is to the left
  await page.locator('#vmTab-text').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#vmTab-look')).toBeFocused();
  expect(await shown()).toEqual(['look']);
  await page.keyboard.press('Home');
  expect(await shown()).toEqual(['ayat']);
  // the bar stays at the top while the part below it scrolls
  await page.locator('#vmTab-text').click();
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const top = await page.locator('#vmSecTabs').evaluate(el => el.getBoundingClientRect().top);
  expect(top).toBeLessThan(2);
  // switching while it is stuck starts the new part right under the bar
  await page.locator('#vmTab-audio').click();
  const gap = await page.evaluate(() => document.querySelector('section[data-sec="audio"]').getBoundingClientRect().top - document.getElementById('vmSecTabs').getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(30);
});
