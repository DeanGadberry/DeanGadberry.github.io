// Verse Loop: plays a range of human-recorded verses, optionally announcing
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
  ticks: $("trimTicks"), readout: $("trimReadout"), viewToggle: $("viewToggle"),
  book: $("book"), bookMeta: $("bookMeta"),
  save: $("save"), saveLen: $("saveLen"), saveNote: $("saveNote"),
};

const settings = loadSettings();
const state = {
  books: null,         // data/books.json: the index of books
  book: null,          // data/{id}.json: the book on screen
  shown: 1,            // chapter on screen
  range: null,         // {from: [c, v], to: [c, v]}
  anchor: null,        // first tap of a tap-tap selection
  timeline: [],        // [{c, v, start, end}] seconds inside the rendered WAV
  renderId: 0,
  url: null,
  autoplay: false,
  view: "chapter",     // "range": just the chosen verses; "chapter": a whole chapter to pick from
};

const audio = new Audio();
audio.preload = "auto";
if (navigator.audioSession) navigator.audioSession.type = "playback"; // ignore iOS silent switch

// ------------------------------------------------------------------ data

const indexReady = fetch("data/books.json").then((r) => r.json()).then((x) => (state.books = x));
const bookData = new Map(); // id -> Promise<book>
function loadBook(id) {
  if (!bookData.has(id)) {
    const p = fetch(`data/${id}.json`).then((r) => { if (!r.ok) throw new Error(id); return r.json(); });
    p.catch(() => bookData.delete(id));
    bookData.set(id, p);
  }
  return bookData.get(id);
}
const bookInfo = (id) => state.books.books.find((b) => b.id === id);

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

// Book names as people type them: "Romans", "rom", "1 Pet", "First Peter", "Rev".
const BOOK_NAMES = [
  ["rut", /^ru(?:th|t)?\b/i], ["jon", /^jon(?:ah)?\b|^jnh\b/i], ["mar", /^m(?:ar)?k\b|^mark\b|^mrk\b/i],
  ["rom", /^ro(?:m|mans)?\b/i], ["eph", /^eph(?:es(?:ians)?)?\b/i], ["heb", /^heb(?:rews)?\b/i],
  ["jam", /^ja(?:s|m|mes)?\b|^jms\b/i], ["1pe", /^(?:1|i|1st|first)\s*p(?:e|et|t|eter)?\b/i],
  ["rev", /^rev(?:elation)?\b|^re\b/i],
];
function splitBook(input) {
  const t = input.trim();
  for (const [id, re] of BOOK_NAMES) {
    const m = t.match(re);
    if (m) return [id, t.slice(m[0].length).replace(/^[.\s]+/, "")];
  }
  return [null, t];
}

export function parseRef(input, book) {
  const s = input.replace(/[–—]/g, "-").replace(/\s+/g, "").replace(/\./g, ":");
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
    if (!n) throw new Error(`${book.book} has ${book.chapters.length} chapter${book.chapters.length > 1 ? "s" : ""}`);
    if (v < 1 || v > n) throw new Error(`${book.book} ${c} has ${n} verses`);
  }
  if (verseKey(...to) < verseKey(...from)) [from, to] = [to, from];
  return { from, to };
}
function lastVerse(book, c) {
  const ch = book.chapters.find((x) => x.c === c);
  return ch ? ch.verses[ch.verses.length - 1].v : 0;
}
function fmtRange(r, book = `${state.book.book} `) {
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

// Before each verse he says just its numbers, chapter then verse ("two ...
// three"), or the verse number alone: one shared set of number clips.
const numberUrl = (n) => `audio/num/${n}.mp3`;
const verseUrl = (c, v) => `audio/${state.book.id}/${c}-${v}.mp3`;
const introNumbers = (c, v) =>
  settings.announce === "full" ? [c, v] : settings.announce === "verse" ? [v] : [];
async function intro(c, v) {
  const nums = introNumbers(c, v);
  if (!nums.length) return null;
  const clips = await Promise.all(nums.map((n) => clip(numberUrl(n))));
  const gap = Math.round(state.books.number_gap * SR);
  const out = new Float32Array(clips.reduce((t, x) => t + x.length, 0) + gap * (clips.length - 1));
  let pos = 0;
  clips.forEach((x, i) => { out.set(x, pos); pos += x.length + (i < clips.length - 1 ? gap : 0); });
  return out;
}

async function render() {
  const id = ++state.renderId;
  const range = state.range;
  if (!range) return;
  const verses = verseList(range);
  setStatus("Loading…");
  els.play.disabled = true;
  const parts = await Promise.all(verses.map((vv) => Promise.all([intro(vv.c, vv.v), clip(verseUrl(vv.c, vv.v))])));
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
    els.text.classList.toggle("live", !!key);
    if (key) {
      const el = document.getElementById(`v${seg.c}-${seg.v}`);
      el?.classList.add("playing");
      // Follow along, unless the listener has scrolled in the last few seconds.
      if (el && state.view === "range" && performance.now() - lastUserScroll > 4000) {
        el.scrollIntoView({ block: "nearest", behavior: REDUCED_MOTION ? "auto" : "smooth" });
      }
    }
    lastSeg = key;
  }
  paintSegbar(seg);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
let lastUserScroll = -1e9;
// Any scrolling, touching or typing pauses the follow-along for a few seconds.
for (const ev of ["wheel", "touchmove", "pointerdown", "keydown"]) addEventListener(ev, () => { lastUserScroll = performance.now(); }, { passive: true, capture: true });

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
    artist: state.book.reader,
    album: "Verse Loop",
    artwork: [{ src: "icon-192.png", sizes: "192x192", type: "image/png" },
              { src: "icon-512.png", sizes: "512x512", type: "image/png" }],
  });
  navigator.mediaSession.setActionHandler("play", () => audio.play());
  navigator.mediaSession.setActionHandler("pause", () => audio.pause());
}

// ------------------------------------------------------------------ verses on screen
// With a range chosen, only its verses are shown. While it plays, the verse
// being read is lit and the rest are dimmed, and tapping a verse jumps to
// it. "Whole chapter" shows a chapter to choose a new range from by tapping
// a first and a last verse.

function renderText() {
  const r = state.range;
  const ranged = state.view === "range" && !!r;
  const verses = ranged ? verseList(r) : chapter(state.shown).verses.map((vv) => ({ c: state.shown, ...vv }));
  const multi = ranged && r.from[0] !== r.to[0];
  let html = "", lastC = null;
  for (const vv of verses) {
    if (multi && vv.c !== lastC) html += `<h3 class="chap-break">Chapter ${vv.c}</h3>`;
    lastC = vv.c;
    html += `<p class="verse" id="v${vv.c}-${vv.v}" data-c="${vv.c}" data-v="${vv.v}" tabindex="0" role="button">` +
      `<sup>${vv.v}</sup> ${kjvHtml(vv.text)}</p>`;
  }
  els.text.innerHTML = html;
  els.text.classList.toggle("ranged", ranged);
  els.chapterTitle.textContent = ranged ? fmtRange(r) : `Chapter ${state.shown}`;
  els.viewToggle.hidden = !r;
  els.viewToggle.textContent = ranged ? `Whole chapter ${r.from[0]}` : "Just my verses";
  paintSelection();
  lastSeg = null; // re-light the verse being read
}

els.viewToggle.addEventListener("click", () => {
  if (state.view === "range") { state.view = "chapter"; showChapter(state.range.from[0]); }
  else { state.view = "range"; state.anchor = null; renderText(); }
});

function jumpTo(c, v) {
  const seg = state.timeline.find((s) => s.c === c && s.v === v);
  if (!seg) return;
  audio.currentTime = seg.start;
  audio.play().catch(() => {});
}

// ------------------------------------------------------------------ save a loop
// A web page can't keep playing once it's closed, so this makes a file
// that can: the range repeated for 15 minutes to an hour, built by joining
// the recorded MP3 clips frame by frame (nothing is re-encoded). Each clip's
// ID3 tag and Xing/Info header are dropped so the joined file is one plain
// stream whose length every player reads correctly.

const KBPS = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
               2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
function frameLength(b, i) {
  const ver = (b[i + 1] >> 3) & 3, mpeg1 = ver === 3;
  const kbps = KBPS[mpeg1 ? 1 : 2][b[i + 2] >> 4], rate = RATES[ver]?.[(b[i + 2] >> 2) & 3];
  return kbps && rate ? Math.floor(((mpeg1 ? 144 : 72) * kbps * 1000) / rate) + ((b[i + 2] >> 1) & 1) : 0;
}
function mp3Frames(buf) {
  const b = new Uint8Array(buf);
  let i = 0, end = b.length;
  if (b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {  // "ID3"
    i = 10 + (((b[6] & 127) << 21) | ((b[7] & 127) << 14) | ((b[8] & 127) << 7) | (b[9] & 127));
  }
  if (end > 128 && b[end - 128] === 0x54 && b[end - 127] === 0x41 && b[end - 126] === 0x47) end -= 128; // "TAG"
  while (i + 4 < end && !(b[i] === 0xff && (b[i + 1] & 0xe0) === 0xe0)) i++;
  const head = String.fromCharCode(...b.subarray(i + 4, i + 48));
  if (/Xing|Info/.test(head)) i += frameLength(b, i);
  return b.subarray(i, end);
}
const rawClips = new Map(); // url -> Promise<Uint8Array>
function rawClip(url) {
  if (!rawClips.has(url)) {
    const p = fetch(url).then((r) => { if (!r.ok) throw new Error(url); return r.arrayBuffer(); }).then(mp3Frames);
    p.catch(() => rawClips.delete(url));
    rawClips.set(url, p);
  }
  return rawClips.get(url);
}
const silenceUrl = (sec) => `audio/s/${Math.round(sec * 1000)}.mp3`;

async function saveLoop() {
  const r = state.range;
  if (!r || !state.total) return;
  const minutes = +settings.saveLen;
  els.save.disabled = true;
  els.saveNote.textContent = "Making the file…";
  try {
    const pass = [];
    for (const vv of verseList(r)) {
      introNumbers(vv.c, vv.v).forEach((n, i, all) => pass.push(numberUrl(n), silenceUrl(i < all.length - 1 ? 0.3 : ANN_GAP)));
      pass.push(verseUrl(vv.c, vv.v), silenceUrl(+settings.gap));
    }
    const parts = await Promise.all(pass.map(rawClip));
    const repeats = Math.max(1, Math.round((minutes * 60) / state.total));
    const blob = new Blob(Array.from({ length: repeats }, () => parts).flat(), { type: "audio/mpeg" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${state.book.book} ${shortRange(r).replace(/:/g, ".")} - ${minutes < 60 ? `${minutes} min` : "1 hour"} loop.mp3`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    els.saveNote.textContent = `Saved: ${repeats} times through, ${fmtTime(repeats * state.total)}, ${(blob.size / 1e6).toFixed(1)} MB.`;
  } catch {
    els.saveNote.textContent = "Couldn't make the file. Check the connection and try again.";
  } finally {
    els.save.disabled = false;
  }
}
els.save.addEventListener("click", saveLoop);

// ------------------------------------------------------------------ settings

function loadSettings() {
  const d = { loop: true, announce: "full", gap: "0.8", saveLen: "30" };
  try { return { ...d, ...JSON.parse(localStorage.getItem("verseloop") || localStorage.getItem("shema") || localStorage.getItem("alphaomega") || "{}") }; } catch { return d; }
}
function saveSettings() {
  try { localStorage.setItem("verseloop", JSON.stringify(settings)); } catch {}
}
function syncSettingsUI() {
  els.loop.setAttribute("aria-pressed", String(settings.loop));
  for (const [group, value] of [[els.announce, settings.announce], [els.gap, settings.gap], [els.saveLen, settings.saveLen]]) {
    for (const b of group.querySelectorAll("button")) b.setAttribute("aria-checked", String(b.dataset.v === value));
  }
}
els.loop.addEventListener("click", () => {
  settings.loop = !settings.loop;
  audio.loop = settings.loop;
  syncSettingsUI(); saveSettings(); updateStatus();
});
for (const [group, key] of [[els.announce, "announce"], [els.gap, "gap"], [els.saveLen, "saveLen"]]) {
  group.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || settings[key] === b.dataset.v) return;
    settings[key] = b.dataset.v;
    syncSettingsUI(); saveSettings();
    if (key !== "saveLen") render();
  });
}

// ------------------------------------------------------------------ selection

function setRange(range, { autoplay = false } = {}) {
  state.range = range;
  state.autoplay = autoplay;
  els.label.textContent = fmtRange(range);
  els.ref.value = shortRange(range);
  els.err.hidden = true;
  history.replaceState(null, "", `#${state.book.id}${shortRange(range)}`);
  // Show just the chosen verses, except mid-way through a tap-tap choice.
  state.view = state.anchor ? "chapter" : "range";
  renderText();
  renderTrim();
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
  for (const b of els.chapters.querySelectorAll("button")) b.setAttribute("aria-current", String(+b.dataset.c === c));
  renderText();
  renderTrim(true);
}

function onVerseTap(el) {
  const at = [+el.dataset.c, +el.dataset.v];
  if (state.view === "range") return jumpTo(...at);
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
  const [id, rest] = splitBook(els.ref.value);
  (id && id !== state.book.id ? openBook(id) : Promise.resolve()).then(() => {
    const r = parseRef(rest, state.book);
    if (!r) return;
    state.anchor = null;
    state.shown = r.from[0];
    setRange(r, { autoplay: true });
    showChapter(r.from[0]);
  }).catch((err) => {
    els.err.textContent = err.message;
    els.err.hidden = false;
  });
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
  const end = () => { if (which) grab(null); };
  track.addEventListener("pointermove", move);
  track.addEventListener("pointerup", end);
  track.addEventListener("pointercancel", end);
  for (const [input, other, w] of [[els.lo, els.hi, "lo"], [els.hi, els.lo, "hi"]]) {
    input.addEventListener("input", () => {
      let a = +els.lo.value, b = +els.hi.value;
      if (a > b) { if (w === "lo") a = b; else b = a; }
      commit(a, b);
    });
    input.addEventListener("focus", () => (w === "lo" ? els.handleLo : els.handleHi).classList.add("focus"));
    input.addEventListener("blur", () => (w === "lo" ? els.handleLo : els.handleHi).classList.remove("focus"));
  }
  function commit(a, b) {
    const c = state.shown, r = state.range;
    if (r && r.from[0] === c && r.to[0] === c && r.from[1] === a && r.to[1] === b) return;
    state.anchor = null;
    setRange({ from: [c, a], to: [c, b] });
  }
}

// ------------------------------------------------------------------ the mark, built on
// The tick pops on and the loop draws round from it, the pilcrow draws in,
// then the arrowhead lands where the loop began with the Chi Rho logo's
// "click"
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

// ------------------------------------------------------------------ the canon strip
// Chi Rho Cards' nine section colours (bible_palette.py), one bar per book
// in canonical order, with this book marked.
const CANON = [["#4C6A7D", 5], ["#8E244D", 12], ["#B85C00", 5], ["#2E6B66", 5], ["#526E2D", 12],
               ["#AE3434", 4], ["#A67C52", 1], ["#1C5D99", 13], ["#1C5D99", 8], ["#6B2E8F", 1]];
function paintCanon(canon) {
  let n = 0;
  $("canon").innerHTML = CANON.flatMap(([color, count]) => Array.from({ length: count }, () =>
    `<i style="background:${color}"${++n === canon ? ' class="here"' : ""}></i>`)).join("");
}

// ------------------------------------------------------------------ books
// Each book takes its Chi Rho Cards section colour (bible_palette.py): the
// masthead, the slider, the playing verse and the player all follow it.

async function openBook(id, initial = null) {
  const book = await loadBook(id);
  audio.pause();
  state.book = book;
  state.range = null; state.anchor = null; state.timeline = []; state.view = "chapter";
  els.play.disabled = true;
  els.label.textContent = "Choose a range of verses";
  setStatus("");
  els.segbar.innerHTML = "";
  const info = bookInfo(id);
  document.documentElement.style.setProperty("--book", info.color);
  document.querySelector('meta[name="theme-color"][media*="light"]')?.setAttribute("content", info.color);
  document.title = `Verse Loop · ${book.book}`;
  els.book.value = id;
  els.bookMeta.textContent = `King James Version · read by ${book.reader}`;
  paintCanon(info.canon);
  els.chapters.innerHTML = book.chapters.map((ch) => `<button type="button" data-c="${ch.c}">${ch.c}</button>`).join("");
  state.shown = initial ? initial.from[0] : 1;
  if (initial) setRange(initial);
  else history.replaceState(null, "", `#${id}`);
  showChapter(state.shown);
  prefetchBook(id);
}

// The address keeps the book and passage: #rom8:28-30 (a bare #2:3-5 is 1 Peter).
function fromHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  const m = h.match(/^([a-z0-9]{3})(.*)$/i);
  const id = m && bookInfo(m[1].toLowerCase()) ? m[1].toLowerCase() : "1pe";
  return [id, m && id === m[1].toLowerCase() ? m[2] : h];
}

// ------------------------------------------------------------------ boot

animateLogo();
indexReady.then(async (index) => {
  els.book.innerHTML = index.books.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
  els.book.addEventListener("change", () => openBook(els.book.value));
  els.chapters.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) { state.view = "chapter"; showChapter(+b.dataset.c); }
  });
  syncSettingsUI();
  setupTrim();
  const [id, ref] = fromHash();
  const book = await loadBook(id);
  let initial = null;
  try { initial = parseRef(ref, book); } catch {}
  await openBook(id, initial);
});

// Fill the offline cache with the book on screen once things are idle.
let swReady = null;
function prefetchBook(id) {
  if (!swReady || navigator.connection?.saveData) return;
  swReady.then((reg) => {
    const go = () => reg.active?.postMessage({ type: "prefetch-book", book: id });
    ("requestIdleCallback" in window) ? requestIdleCallback(go, { timeout: 4000 }) : setTimeout(go, 2000);
  });
}
if ("serviceWorker" in navigator) {
  swReady = navigator.serviceWorker.register("sw.js").then(() => navigator.serviceWorker.ready);
  swReady.then(() => state.book && prefetchBook(state.book.id));
}
