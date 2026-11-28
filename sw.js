// Offline support for the video maker: the app itself works without a connection;
// the recitation (everyayah.com) needs one the first time an ayah is used, and is
// kept afterwards.
//   - App files: precached on install (CORE), then cache-first.
//   - Anything else on this origin (template pictures, backgrounds, …): cached the
//     first time it is used.
//   - Recitation MP3s: cache-first, filled on first use.
// Bump VERSION whenever a cached file changes.
const VERSION = 'qvm-v18';   // v18: video colours, videos in the slideshow, ayah line by line / word by word, translations under the ayat (data/translations, cached by the page on first use); v17: the video maker brought up to date (khatira.js, video-stickers.js, video-script.js, zip-store.js)
const AUDIO = 'qvm-audio-v1';
const TRANS = 'quran-offline-translations-v1';   // the video maker keeps the translations here itself
const CORE = [
  './', './index.html', './manifest.json',
  './pages/video-maker.html',
  './css/fonts.css', './css/svg-theme.css',
  './fonts/cairo/cairo-arabic-wght-normal.woff2', './fonts/cairo/cairo-latin-wght-normal.woff2', './fonts/tajawal-arabic-500-normal.woff2', './fonts/tajawal-latin-500-normal.woff2',
  './fonts/Tajawal.ttf', './fonts/Tajawal-Bold.ttf', './fonts/uthmani-colored.ttf',
  './fonts/UthmanicHafs_V20.ttf', './fonts/Scheherazade.ttf', './fonts/Amiri.ttf',
  './data/quran.json', './data/quran-qpc.json',
  './icons/icon-192.png', './icons/favicon-48.png', './icons/apple-touch-icon.png',
  './img/SVG/close.svg', './img/SVG/home.svg', './img/SVG/search.svg',
  './images/Background-light.webp',
  './images/video-maker/manifest.json',
  './js/back-close.js', './js/i18n.js', './js/mp4-faststart.js', './js/net-status.js',
  './js/popular-ayat.js', './js/quran-text-source.js', './js/reciters.js', './js/surah-map.js',
  './js/svg-injector.js', './js/theme-manager.js', './js/tv-templates.js',
  './js/video-maker-long.js', './js/video-pingpong.js', './js/video-maker-own.js', './js/own-recitation.js', './js/video-maker-rec.js', './js/video-maker-fx.js', './js/audio-fx.js', './js/fx-gate-worklet.js', './js/video-maker.js', './js/vendor/mp4-muxer.js',
  './js/khatira.js', './js/video-stickers.js', './js/video-script.js', './js/zip-store.js',
  './js/i18n/ar.js', './js/i18n/ckb.js', './js/i18n/en.js', './js/i18n/names.js',
  './js/i18n/tr.js', './js/i18n/ur.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== AUDIO && k !== TRANS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isAudio = url.hostname === 'everyayah.com' && url.pathname.endsWith('.mp3');
  if (url.origin !== location.origin && !isAudio) return;
  if (url.pathname.includes('/data/translations/')) return;   // large, cached by the page (TRANS)
  if (req.headers.get('range')) return;          // let the browser handle partial requests itself
  event.respondWith(
    caches.match(req, { ignoreSearch: !isAudio }).then(hit => hit || fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(isAudio ? AUDIO : VERSION).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }))
  );
});
