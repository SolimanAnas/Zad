// Helpers for the user's own recording (pages/video-maker.html, «تسجيلي»):
// the loudness envelope of a decoded recording and a first guess at where each
// ayah starts, from the pauses between them. Pure functions (no DOM, no audio
// objects) so they can be tested in Node: tests/node/own-recitation.test.cjs.
//
// A recording has no ayah timestamps, so the split is a proposal the user checks
// and fixes by ear in the sync sheet. The pauses between ayat are usually longer
// than the breaths inside an ayah, so the N-1 longest pauses are taken as the
// boundaries between N ayat; how clearly they stand out sets the confidence.
(function (root) {
  'use strict';

  const HOP = 0.02;          // envelope resolution (s)
  const MIN_GAP = 0.18;      // shortest pause that can separate two ayat (s)
  const LEAD_IN = 0.15;      // a marker sits this long before the voice starts (s)
  const TAIL_OUT = 0.2;      // the last ayah keeps this long after the voice ends (s)

  // Loudness (dB) per HOP seconds of the mono mix of the channels.
  function envelopeDb(ch0, ch1, sampleRate, hop) {
    const h = hop || HOP;
    const frame = Math.max(1, Math.round(sampleRate * h));
    const n = Math.ceil(ch0.length / frame);
    const out = new Float32Array(n);
    const two = ch1 && ch1 !== ch0;
    for (let f = 0; f < n; f++) {
      const a = f * frame, b = Math.min(ch0.length, a + frame);
      let sum = 0;
      for (let i = a; i < b; i++) {
        const v = two ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
        sum += v * v;
      }
      out[f] = 20 * Math.log10(Math.sqrt(sum / Math.max(1, b - a)) + 1e-9);
    }
    return out;
  }

  function percentile(arr, p) {
    if (!arr.length) return 0;
    const s = Float32Array.from(arr).sort();
    return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
  }

  // Where the ayat start, as seconds into the recording.
  //   env: envelopeDb(...)   hop: its resolution   n: number of ayat expected
  // Returns { markers, end, confidence, method } — markers has n entries (the start of
  // each ayah, ascending), end is where the last one stops. When the pauses cannot
  // be told apart, { markers: null, confidence: 'none' } and the caller falls back to
  // splitting by text length.
  function autoSplit(env, hop, n) {
    const h = hop || HOP;
    if (!(n >= 1) || !env.length) return { markers: null, end: 0, confidence: 'none', method: 'none' };
    const duration = env.length * h;
    const floor = percentile(env, 0.1), speech = percentile(env, 0.9);
    const contrast = speech - floor;
    if (contrast < 6) return { markers: null, end: duration, confidence: 'none', method: 'none' };
    const thr = floor + contrast * 0.3;

    const active = new Uint8Array(env.length);
    for (let i = 0; i < env.length; i++) active[i] = env[i] > thr ? 1 : 0;
    // Clicks: a burst shorter than 50 ms with silence on both sides is not speech.
    const blip = Math.max(1, Math.round(0.05 / h));
    for (let i = 0; i < active.length;) {
      if (!active[i]) { i++; continue; }
      let j = i;
      while (j < active.length && active[j]) j++;
      if (j - i < blip) for (let k = i; k < j; k++) active[k] = 0;
      i = j;
    }
    let first = -1, last = -1;
    for (let i = 0; i < active.length; i++) if (active[i]) { if (first < 0) first = i; last = i; }
    if (first < 0) return { markers: null, end: duration, confidence: 'none', method: 'none' };

    const start = Math.max(0, first * h - LEAD_IN);
    const end = Math.min(duration, (last + 1) * h + TAIL_OUT);
    if (n === 1) return { markers: [start], end, confidence: 'high', method: 'silence' };

    // Silent stretches between the first and the last sound.
    const minLen = Math.ceil(MIN_GAP / h);
    const gaps = [];
    for (let i = first; i <= last;) {
      if (active[i]) { i++; continue; }
      let j = i;
      while (j <= last && !active[j]) j++;
      if (j - i >= minLen) gaps.push({ s: i, e: j - 1, len: j - i });
      i = j;
    }
    if (gaps.length < n - 1) return { markers: null, end, confidence: 'none', method: 'silence', found: gaps.length };

    const byLen = gaps.slice().sort((a, b) => b.len - a.len || a.s - b.s);
    const chosen = byLen.slice(0, n - 1).sort((a, b) => a.s - b.s);
    const rejected = byLen[n - 1];
    const shortest = byLen[n - 2].len;
    let confidence;
    if (!rejected) confidence = shortest * h >= 0.3 ? 'high' : 'medium';
    else {
      const ratio = shortest / rejected.len;
      confidence = ratio >= 1.5 ? 'high' : ratio >= 1.15 ? 'medium' : 'low';
    }
    const markers = [start];
    for (const g of chosen) {
      const a = g.s * h, b = (g.e + 1) * h;
      markers.push(Math.max(a + (b - a) * 0.5, b - LEAD_IN));   // just before the next voice starts
    }
    return { markers, end, confidence, method: 'silence' };
  }

  // The fallback: the time shared between the ayat by the length of their text.
  function proportional(start, end, weights) {
    const sum = weights.reduce((a, b) => a + b, 0) || 1;
    const markers = [];
    let t = start;
    for (const w of weights) { markers.push(t); t += (end - start) * w / sum; }
    return markers;
  }

  // Markers ascending, each at least `minGap` after the one before, inside [0, end).
  function normalizeMarkers(markers, end, minGap) {
    const gap = minGap == null ? 0.2 : minGap;
    const out = [];
    for (let i = 0; i < markers.length; i++) {
      const lo = i ? out[i - 1] + gap : 0;
      const hi = end - gap * (markers.length - i);
      out.push(Math.min(Math.max(+markers[i] || 0, lo), Math.max(lo, hi)));
    }
    return out;
  }

  // Min / max-style outline of the envelope for the waveform picture:
  // `bars` values in 0..1 (loudness scaled between the quiet and the loud parts).
  function outline(env, bars) {
    const floor = percentile(env, 0.05), top = Math.max(percentile(env, 0.98), floor + 1);
    const out = new Float32Array(bars);
    for (let b = 0; b < bars; b++) {
      const a = Math.floor(b * env.length / bars), z = Math.max(a + 1, Math.floor((b + 1) * env.length / bars));
      let m = -Infinity;
      for (let i = a; i < z && i < env.length; i++) if (env[i] > m) m = env[i];
      out[b] = Math.min(1, Math.max(0, (m - floor) / (top - floor)));
    }
    return out;
  }

  const api = { HOP, MIN_GAP, envelopeDb, autoSplit, proportional, normalizeMarkers, outline, percentile };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.OwnRecitation = api;
})(typeof window !== 'undefined' ? window : globalThis);
