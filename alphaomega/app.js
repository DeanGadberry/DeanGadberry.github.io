// Alpha Omega: plays a range of human-recorded verses, optionally announcing
// "Chapter N, verse M" before each one, and loops it.
//
// Speed strategy: each verse is its own small MP3, so a range only downloads
// the verses it needs (in parallel). They are decoded once, stitched into a
// single WAV in memory and handed to an <audio> element, so pressing Play is
// instant, looping is native and seamless, and playback keeps going with the
// screen locked. The service worker caches everything for offline use.

const SR = 22050;
const ANN_GAP = 0.3; // silence between the announcement and the verse
const REDUCED_MOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;

const $ = (id) => document.getElementById(id);
const els = {
  form: $("refForm"), ref: $("ref"), err: $("refError"), chapters: $("chapters"),
  text: $("text"), chapterTitle: $("chapterTitle"), play: $("play"), loop: $("loop"),
  announce: $("announce"), gap: $("gap"), label: $("rangeLabel"), status: $("status"),
  segbar: $("segbar"), trim: $("trim"), track: $("trimTrack"), fill: $("trimFill"),
  lo: $("trimLo"), hi: $("trimHi"), handleLo: $("handleLo"), handleHi: $("handleHi"),
  ticks: $("trimTicks"), readout: $("trimReadout"), cardInner: $("cardInner"),
  faces: [$("faceA"), $("faceB")],
};

const settings = loadSettings();
const state = {
  book: null,          // data/1pe.json
  shown: 1,            // chapter on screen
  range: null,         // {from: [c, v], to: [c, v]}
  anchor: null,        // first tap of a tap-tap selection
  timeline: [],        // [{c, v, start, end}] seconds inside the rendered WAV
  renderId: 0,
  url: null,
  autoplay: false,
};

const audio = new Audio();
audio.preload = "auto";
if (navigator.audioSession) navigator.audioSession.type = "playback"; // ignore iOS silent switch

// ------------------------------------------------------------------ data

const bookReady = fetch("data/1pe.json").then((r) => r.json()).then((b) => {
  state.book = b;
  return b;
});

const verseKey = (c, v) => c * 1000 + v;
function verseList(range) {
  const out = [];
  for (const ch of state.book.chapters) {
    for (const vv of ch.verses) {
      const k = verseKey(ch.c, vv.v);
      if (k >= verseKey(...range.from) && k <= verseKey(...range.to)) out.push({ c: ch.c, ...vv });
    }
  }
  return out;
}
const chapter = (c) => state.book.chapters.find((ch) => ch.c === c);
const verseText = (c, v) => chapter(c).verses.find((x) => x.v === v).text;

// ------------------------------------------------------------------ reference parsing

const BOOK_RE = /^\s*(?:(?:1|i|1st|first)\s*(?:peter|pet|pe|pt|p)\.?)\s*/i;

export function parseRef(input, book) {
  const s = input.replace(BOOK_RE, "").replace(/[–—]/g, "-").replace(/\s+/g, "").replace(/\./g, ":");
  if (!s) return null;
  const m = s.match(/^(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/);
  if (!m) throw new Error("Try something like 2:3-5, 1:22-2:3 or 3");
  const [, c1s, v1s, xs, v2s] = m;
  const c1 = +c1s;
  let from, to;
  if (v1s == null) {
    // "3" or "3-4": whole chapters
    const c2 = xs ? +xs : c1;
    from = [c1, 1];
    to = [c2, lastVerse(book, c2)];
  } else {
    from = [c1, +v1s];
    if (xs == null) to = [c1, +v1s];
    else if (v2s == null) to = [c1, +xs];
    else to = [+xs, +v2s];
  }
  for (const [c, v] of [from, to]) {
    const n = lastVerse(book, c);
    if (!n) throw new Error(`1 Peter has 5 chapters`);
    if (v < 1 || v > n) throw new Error(`1 Peter ${c} has ${n} verses`);
  }
  if (verseKey(...to) < verseKey(...from)) [from, to] = [to, from];
  return { from, to };
}
function lastVerse(book, c) {
  const ch = book.chapters.find((x) => x.c === c);
  return ch ? ch.verses[ch.verses.length - 1].v : 0;
}
function fmtRange(r, book = "1 Peter ") {
  const [c1, v1] = r.from, [c2, v2] = r.to;
  if (c1 === c2 && v1 === v2) return `${book}${c1}:${v1}`;
  if (c1 === c2) return `${book}${c1}:${v1}–${v2}`;
  return `${book}${c1}:${v1}–${c2}:${v2}`;
}
function shortRange(r) {
  const [c1, v1] = r.from, [c2, v2] = r.to;
  if (c1 === c2 && v1 === v2) return `${c1}:${v1}`;
  return c1 === c2 ? `${c1}:${v1}-${v2}` : `${c1}:${v1}-${c2}:${v2}`;
}

// ------------------------------------------------------------------ audio

const decoder = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, SR);
const buffers = new Map(); // url -> Promise<Float32Array>

function clip(url) {
  if (!buffers.has(url)) {
    const p = fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.arrayBuffer(); })
      .then((ab) => new Promise((res, rej) => decoder.decodeAudioData(ab, res, rej)))
      .then((buf) => trim(buf.getChannelData(0)));
    p.catch(() => buffers.delete(url));
    buffers.set(url, p);
  }
  return buffers.get(url);
}

// MP3 encoders pad the start and end with a little silence; strip it so
// the pauses we add are the pauses you hear.
function trim(x) {
  const thr = 0.002;
  let a = 0, b = x.length;
  while (a < b && Math.abs(x[a]) < thr) a++;
  while (b > a && Math.abs(x[b - 1]) < thr) b--;
  return x.subarray(Math.max(0, a - 32), Math.min(x.length, b + 32));
}

const annUrl = (c, v) =>
  settings.announce === "full" ? `audio/1pe/a/${c}-${v}.mp3`
  : settings.announce === "verse" ? `audio/1pe/n/${v}.mp3` : null;

async function render() {
  const id = ++state.renderId;
  const range = state.range;
  if (!range) return;
  const verses = verseList(range);
  setStatus("Loading…");
  els.play.disabled = true;
  const parts = await Promise.all(verses.map((vv) => Promise.all([
    annUrl(vv.c, vv.v) ? clip(annUrl(vv.c, vv.v)) : null,
    clip(`audio/1pe/v/${vv.c}-${vv.v}.mp3`),
  ])));
  if (id !== state.renderId) return; // a newer selection won

  const gap = Math.round(+settings.gap * SR), annGap = Math.round(ANN_GAP * SR);
  let total = 0;
  for (const [ann, verse] of parts) total += (ann ? ann.length + annGap : 0) + verse.length + gap;
  const pcm = new Float32Array(total);
  const timeline = [];
  let pos = 0;
  parts.forEach(([ann, verse], i) => {
    const start = pos;
    if (ann) { pcm.set(ann, pos); pos += ann.length + annGap; }
    pcm.set(verse, pos);
    pos += verse.length + gap;
    timeline.push({ c: verses[i].c, v: verses[i].v, start: start / SR, end: pos / SR });
  });

  // Keep the listener on the same verse if they change settings mid-play.
  const wasPlaying = !audio.paused;
  const cur = currentSegment();
  const resumeAt = cur ? timeline.find((t) => t.c === cur.c && t.v === cur.v)?.start ?? 0 : 0;

  const url = URL.createObjectURL(wav(pcm));
  if (state.url) URL.revokeObjectURL(state.url);
  state.url = url;
  state.timeline = timeline;
  audio.src = url;
  audio.loop = settings.loop;
  if (wasPlaying || state.autoplay) {
    audio.currentTime = wasPlaying ? resumeAt : 0;
    state.autoplay = false;
    audio.play().catch(() => {});
  }
  els.play.disabled = false;
  state.total = total / SR;
  renderSegbar();
  updateStatus();
  updateMediaSession();
}

function wav(f32) {
  const buf = new ArrayBuffer(44 + f32.length * 2);
  const dv = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); dv.setUint32(4, 36 + f32.length * 2, true); str(8, "WAVE");
  str(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  str(36, "data"); dv.setUint32(40, f32.length * 2, true);
  const out = new Int16Array(buf, 44);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return new Blob([buf], { type: "audio/wav" });
}

// iOS only lets an <audio> element play from inside a tap. Play a blip of
// silence on the first tap so later play() calls (after loading) are allowed.
let unlocked = false;
function unlock() {
  if (unlocked) return;
  unlocked = true;
  if (audio.src) return;
  audio.src = URL.createObjectURL(wav(new Float32Array(SR / 20)));
  audio.play().then(() => audio.pause()).catch(() => {});
}
addEventListener("pointerdown", unlock, { capture: true, once: true });
addEventListener("keydown", unlock, { capture: true, once: true });

// ------------------------------------------------------------------ playback UI

function currentSegment() {
  const t = audio.currentTime;
  return state.timeline.find((s) => t >= s.start && t < s.end) || null;
}

let lastSeg = null;
function tick() {
  const seg = audio.src && state.timeline.length ? currentSegment() : null;
  const key = seg && !audio.paused ? `${seg.c}:${seg.v}` : null;
  if (key !== lastSeg) {
    document.querySelector(".verse.playing")?.classList.remove("playing");
    if (key) {
      if (seg.c !== state.shown) showChapter(seg.c);
      const el = document.getElementById(`v${seg.c}-${seg.v}`);
      el?.classList.add("playing");
      if (el && innerWidth >= 960) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      showVerseCard(seg.c, seg.v);
    }
    lastSeg = key;
  }
  paintSegbar(seg);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function renderSegbar() {
  els.segbar.innerHTML = state.timeline
    .map((s) => `<span style="flex-grow:${(s.end - s.start).toFixed(2)}"><i></i></span>`).join("");
}
function paintSegbar(seg) {
  const spans = els.segbar.children;
  if (!spans.length) return;
  const t = audio.currentTime;
  state.timeline.forEach((s, i) => {
    const f = t >= s.end ? 1 : t <= s.start ? 0 : (t - s.start) / (s.end - s.start);
    const w = `${(f * 100).toFixed(1)}%`;
    const bar = spans[i]?.firstChild;
    if (bar && bar.style.width !== w) bar.style.width = w;
  });
}

function togglePlay() {
  if (!state.range) return;
  if (audio.paused) audio.play().catch(() => {});
  else audio.pause();
}
audio.addEventListener("play", () => { document.body.classList.add("is-playing"); els.play.setAttribute("aria-label", "Pause"); });
audio.addEventListener("pause", () => { document.body.classList.remove("is-playing"); els.play.setAttribute("aria-label", "Play"); });
audio.addEventListener("ended", () => { document.body.classList.remove("is-playing"); audio.currentTime = 0; });

els.play.addEventListener("click", togglePlay);
addEventListener("keydown", (e) => {
  if (e.code === "Space" && (e.target === document.body || e.target.closest?.(".verse"))) { e.preventDefault(); togglePlay(); }
});

function updateStatus() {
  if (!state.range || !state.timeline.length) return;
  const n = state.timeline.length;
  setStatus(`${n} verse${n > 1 ? "s" : ""} · ${fmtTime(state.total)} · ${settings.loop ? "looping" : "plays once"}`);
}

function updateMediaSession() {
  if (!("mediaSession" in navigator) || !state.range) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: fmtRange(state.range),
    artist: `${state.book.reader} · LibriVox`,
    album: "Alpha Omega",
    artwork: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" },
              { src: "icon-512.png", sizes: "512x512", type: "image/png" }],
  });
  navigator.mediaSession.setActionHandler("play", () => audio.play());
  navigator.mediaSession.setActionHandler("pause", () => audio.pause());
}

// ------------------------------------------------------------------ the card

const MARK = `<svg viewBox="-46 -34 92 74" aria-hidden="true"><use href="#ao-mark"/></svg>`;
let cardFace = 0, cardTurn = 0, cardKey = null;

function flipCard(key, html, cls) {
  if (key === cardKey) return;
  const first = cardKey === null;
  cardKey = key;
  if (REDUCED_MOTION || first) {
    els.faces[cardFace].innerHTML = html;
    els.faces[cardFace].className = `face ${cardFace ? "back" : "front"} ${cls}`;
    return;
  }
  const next = 1 - cardFace;
  els.faces[next].innerHTML = html;
  els.faces[next].className = `face ${next ? "back" : "front"} ${cls}`;
  cardTurn -= 180;
  els.cardInner.style.transform = `rotateY(${cardTurn}deg)`;
  cardFace = next;
}

function showVerseCard(c, v) {
  const text = verseText(c, v);
  const words = text.split(/\s+/).length;
  const cls = words > 70 ? "xlong" : words > 48 ? "long" : "";
  flipCard(`${c}:${v}`, `
    <div class="face-head"><span>1 Peter ${c}</span></div>
    <div class="face-body"><span class="vn">${v}</span><p>${kjvHtml(text)}</p></div>
    <div class="face-foot"><span>KJV</span><span class="mini">ALPHA ${MARK} OMEGA</span><span>${c}:${v}</span></div>`, cls);
}

function showTitleCard() {
  flipCard("title", `${MARK}<div class="t-book">1 Peter</div>
    <div class="t-hint">Choose verses with Α and Ω, then press play</div>`, "title");
}

// ------------------------------------------------------------------ settings

function loadSettings() {
  const d = { loop: true, announce: "full", gap: "0.8" };
  try { return { ...d, ...JSON.parse(localStorage.getItem("alphaomega") || "{}") }; } catch { return d; }
}
function saveSettings() {
  try { localStorage.setItem("alphaomega", JSON.stringify(settings)); } catch {}
}
function syncSettingsUI() {
  els.loop.setAttribute("aria-pressed", String(settings.loop));
  for (const [group, value] of [[els.announce, settings.announce], [els.gap, settings.gap]]) {
    for (const b of group.querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.v === value));
  }
}
els.loop.addEventListener("click", () => {
  settings.loop = !settings.loop;
  audio.loop = settings.loop;
  syncSettingsUI(); saveSettings(); updateStatus();
});
for (const [group, key] of [[els.announce, "announce"], [els.gap, "gap"]]) {
  group.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || settings[key] === b.dataset.v) return;
    settings[key] = b.dataset.v;
    syncSettingsUI(); saveSettings(); render();
  });
}

// ------------------------------------------------------------------ selection

function setRange(range, { autoplay = false, card = true } = {}) {
  state.range = range;
  state.autoplay = autoplay;
  els.label.textContent = fmtRange(range);
  els.ref.value = shortRange(range);
  els.err.hidden = true;
  history.replaceState(null, "", `#${shortRange(range)}`);
  paintSelection();
  renderTrim();
  if (card && audio.paused) showVerseCard(...range.from);
  render();
}

function paintSelection() {
  const r = state.range;
  for (const el of els.text.querySelectorAll(".verse")) {
    const k = verseKey(+el.dataset.c, +el.dataset.v);
    el.classList.toggle("sel", !!r && k >= verseKey(...r.from) && k <= verseKey(...r.to));
    el.classList.toggle("edge-a", !!state.anchor && k === verseKey(...state.anchor));
  }
  for (const b of els.chapters.querySelectorAll("button")) {
    const c = +b.dataset.c;
    b.classList.toggle("has-sel", !!r && c >= r.from[0] && c <= r.to[0]);
  }
}

function showChapter(c) {
  state.shown = c;
  const ch = chapter(c);
  els.chapterTitle.textContent = `Chapter ${c}`;
  els.text.innerHTML = ch.verses.map((vv) =>
    `<p class="verse" id="v${c}-${vv.v}" data-c="${c}" data-v="${vv.v}" tabindex="0" role="button">` +
    `<sup>${vv.v}</sup> ${kjvHtml(vv.text)}</p>`).join("");
  for (const b of els.chapters.querySelectorAll("button")) b.setAttribute("aria-current", String(+b.dataset.c === c));
  paintSelection();
  renderTrim(true);
}

function onVerseTap(el) {
  const at = [+el.dataset.c, +el.dataset.v];
  if (!state.anchor) {
    state.anchor = at;
    setRange({ from: at, to: at });
  } else {
    const a = state.anchor;
    state.anchor = null;
    const [from, to] = verseKey(...at) < verseKey(...a) ? [at, a] : [a, at];
    setRange({ from, to });
  }
}
els.text.addEventListener("click", (e) => {
  const el = e.target.closest(".verse");
  if (el) onVerseTap(el);
});
els.text.addEventListener("keydown", (e) => {
  const el = e.target.closest(".verse");
  if (el && e.key === "Enter") { e.preventDefault(); onVerseTap(el); }
});

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  els.ref.blur();
  try {
    const r = parseRef(els.ref.value, state.book);
    if (!r) return;
    state.anchor = null;
    showChapter(r.from[0]);
    setRange(r, { autoplay: true });
  } catch (err) {
    els.err.textContent = err.message;
    els.err.hidden = false;
  }
});

// ------------------------------------------------------------------ Alpha/Omega range slider
// Two handles over the shown chapter's verses (the same build as the range
// slider in Aleph with Beth Offline): pressing anywhere on the track grabs
// the nearest handle, and the native inputs underneath serve the keyboard.

const HANDLE_W = 28; // matches .handle in style.css
function trimSpan() {
  const c = state.shown, n = lastVerse(state.book, c), r = state.range;
  if (!r || verseKey(...r.to) < verseKey(c, 1) || verseKey(...r.from) > verseKey(c, n)) return null;
  return [r.from[0] === c ? r.from[1] : 1, r.to[0] === c ? r.to[1] : n];
}

function renderTrim(rebuild = false) {
  if (!state.book) return;
  const n = lastVerse(state.book, state.shown);
  if (rebuild || +els.hi.max !== n) {
    els.lo.max = els.hi.max = String(n);
    els.ticks.innerHTML = Array.from({ length: n }, (_, i) => {
      const v = i + 1, major = v === 1 || v === n || v % 5 === 0;
      return `<span class="${major ? "" : "minor"}" style="left:${pos(v, n)}">${major ? v : ""}</span>`;
    }).join("");
  }
  const span = trimSpan();
  const [a, b] = span || [1, n];
  els.lo.value = a; els.hi.value = b;
  els.trim.classList.toggle("active", !!span);
  els.handleLo.style.left = pos(a, n);
  els.handleHi.style.left = pos(b, n);
  els.fill.style.left = pos(a, n);
  els.fill.style.width = `calc(${pos(b, n)} - ${pos(a, n)})`;
  const r = state.range;
  const count = span ? b - a + 1 : 0;
  els.readout.textContent = !span ? "Drag Α and Ω to choose"
    : r.from[0] === r.to[0] ? `${state.shown}:${a} → ${state.shown}:${b} · ${count} verse${count > 1 ? "s" : ""}`
    : fmtRange(r, "");
}
const pos = (v, n) => `calc(${HANDLE_W / 2}px + (100% - ${HANDLE_W}px) * ${n > 1 ? (v - 1) / (n - 1) : 0})`;

function setupTrim() {
  const track = els.track;
  let which = null, startX = 0;
  const valueAt = (clientX) => {
    const max = +els.hi.max;
    const r = track.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left - HANDLE_W / 2) / (r.width - HANDLE_W)));
    return Math.round(1 + f * (max - 1));
  };
  const grab = (w) => {
    which = w;
    els.handleLo.classList.toggle("grab", w === "lo");
    els.handleHi.classList.toggle("grab", w === "hi");
  };
  track.addEventListener("pointerdown", (e) => {
    const v = valueAt(e.clientX);
    const span = trimSpan();
    const lo = span ? span[0] : v, hi = span ? span[1] : v;
    if (!span) { commit(v, v); grab("either"); }
    else if (v < lo) grab("lo");
    else if (v > hi) grab("hi");
    else if (lo === hi) grab("either"); // stacked handles: the drag direction decides
    else grab(v - lo <= hi - v ? "lo" : "hi");
    startX = e.clientX;
    track.setPointerCapture(e.pointerId);
    if (which !== "either") move(e);
    e.preventDefault();
  });
  const move = (e) => {
    if (!which) return;
    if (which === "either") {
      if (Math.abs(e.clientX - startX) < 4) return;
      grab(e.clientX > startX ? "hi" : "lo");
    }
    const v = valueAt(e.clientX);
    const [lo, hi] = trimSpan() || [v, v];
    if (which === "lo") commit(Math.min(v, hi), hi); else commit(lo, Math.max(v, lo));
  };
  const end = () => {
    if (!which) return;
    grab(null);
    if (state.range && audio.paused) showVerseCard(...state.range.from);
  };
  track.addEventListener("pointermove", move);
  track.addEventListener("pointerup", end);
  track.addEventListener("pointercancel", end);
  for (const [input, other, w] of [[els.lo, els.hi, "lo"], [els.hi, els.lo, "hi"]]) {
    input.addEventListener("input", () => {
      let a = +els.lo.value, b = +els.hi.value;
      if (a > b) { if (w === "lo") a = b; else b = a; }
      commit(a, b, true);
    });
    input.addEventListener("focus", () => (w === "lo" ? els.handleLo : els.handleHi).classList.add("focus"));
    input.addEventListener("blur", () => (w === "lo" ? els.handleLo : els.handleHi).classList.remove("focus"));
  }
  function commit(a, b, card = false) {
    const c = state.shown, r = state.range;
    if (r && r.from[0] === c && r.to[0] === c && r.from[1] === a && r.to[1] === b) return;
    state.anchor = null;
    setRange({ from: [c, a], to: [c, b] }, { card });
  }
}

// ------------------------------------------------------------------ the mark, built on
// Alpha draws down from its apex, Omega draws around, then the return arrow
// sweeps back to the beginning and lands with the Chi Rho logo's "click"
// (a quick press, then a damped spring: omega0 14.4, zeta 0.8).

function animateLogo() {
  const svg = $("logo");
  const draws = [...svg.querySelectorAll("[data-draw]")];
  const pops = [...svg.querySelectorAll("[data-pop]")];
  const click = svg.querySelector("[data-click]");
  if (REDUCED_MOTION) return;
  for (const p of draws) { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; p.dataset.len = L; }
  for (const p of [...pops, click]) { p.style.transformBox = "fill-box"; p.style.transformOrigin = "center"; p.style.transform = "scale(0)"; }
  const HOLD = 200, UNIT = 420, PRESS = 130, W0 = 14.4, Z = 0.8;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const clamp = (t) => Math.max(0, Math.min(1, t));
  const spring = (s) => {
    const wd = W0 * Math.sqrt(1 - Z * Z);
    return Math.exp(-Z * W0 * s) * (Math.cos(wd * s) + (Z * W0 / wd) * Math.sin(wd * s));
  };
  const t0 = performance.now();
  const frame = (now) => {
    const t = now - t0 - HOLD;
    for (const p of draws) {
      const k = +p.dataset.draw - 1;
      p.style.strokeDashoffset = p.dataset.len * (1 - ease(clamp((t - k * UNIT) / UNIT)));
    }
    for (const p of pops) {
      const k = +p.dataset.pop - 1;
      p.style.transform = `scale(${ease(clamp((t - k * UNIT - UNIT * 0.6) / (UNIT * 0.5)))})`;
    }
    const tc = t - 3 * UNIT;
    let sc = 0;
    if (tc > 0) sc = tc < PRESS ? 1.35 * ease(tc / PRESS) : 1 + 0.35 * spring((tc - PRESS) / 1000);
    click.style.transform = `scale(${sc})`;
    if (t < 3 * UNIT + 1200) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
$("logo").addEventListener("click", animateLogo);

// ------------------------------------------------------------------ helpers

function setStatus(s) { els.status.textContent = s; }
function fmtTime(s) { s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
// [Brackets] mark the words the KJV prints in italics (supplied by the
// translators); print them in italics.
function kjvHtml(s) { return escapeHtml(s).replace(/\[([^\]]+)\]/g, "<em>$1</em>"); }
function escapeHtml(s) { return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]); }

// ------------------------------------------------------------------ boot

animateLogo();
bookReady.then((book) => {
  els.chapters.innerHTML = book.chapters.map((ch) => `<button type="button" data-c="${ch.c}">${ch.c}</button>`).join("");
  els.chapters.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) showChapter(+b.dataset.c);
  });
  syncSettingsUI();
  setupTrim();
  let initial = null;
  try { initial = parseRef(decodeURIComponent(location.hash.slice(1)), book); } catch {}
  showChapter(initial ? initial.from[0] : 1);
  if (initial) setRange(initial);
  else showTitleCard();
});

if ("serviceWorker" in navigator) {
  addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready).then((reg) => {
      // Fill the offline cache with the rest of the book once things are idle.
      const go = () => reg.active?.postMessage({ type: "prefetch-all" });
      if (navigator.connection?.saveData) return;
      ("requestIdleCallback" in window) ? requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 2000);
    });
  });
}
