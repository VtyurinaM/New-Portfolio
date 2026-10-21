(() => {
'use strict';
const G = window.GEO, C = window.CONTENT, PF = window.PROJECT_FILES || {};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const IMG = 'assets1/', VID = '', PRJ = 'assets1/';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ORDER = [1, 2, 4, 8, 9];
const STOPS = [1, 2, 4, 9]; // 8 is passed through without stopping
const wait = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const body = document.body;

const slides = {};
$$('.slide').forEach(el => { slides[+el.dataset.slide] = el; });

const state = { cur: 1, busy: false, fast: false, dir: 0, cat: null, rects: {}, project: null, page: 0, needGap: false };

/* ------------------------------------------------------------ geometry */
function fit(n) {
  const s = G.slides[n], vw = innerWidth, vh = innerHeight;
  const cover = Math.max(vw / s.w, vh / s.h), contain = Math.min(vw / s.w, vh / s.h);
  const z = (vw < vh && s.zoomP) ? s.zoomP : (s.zoom || 1.5);
  const sc = Math.min(cover, contain * z);
  const w = s.w * sc, h = s.h * sc, fx = s.fx ?? .5, fy = s.fy ?? .5;
  let x = (vw - w) / 2, y = (vh - h) / 2;
  if (w > vw) x = clamp(vw / 2 - fx * w, vw - w, 0);
  if (h > vh) y = clamp(vh / 2 - fy * h, vh - h, 0);
  return { x, y, sc, w, h };
}
function place(el, box, n) { // box in image px -> % of stage
  const s = G.slides[n];
  el.style.left = (box[0] / s.w * 100) + '%';
  el.style.top = (box[1] / s.h * 100) + '%';
  el.style.width = ((box[2] - box[0]) / s.w * 100) + '%';
  el.style.height = ((box[3] - box[1]) / s.h * 100) + '%';
}

function layout() {
  for (const n of Object.keys(G.slides)) state.rects[n] = fit(+n);
  state.rects[6] = rect6card();
  for (const n of Object.keys(G.slides)) {
    const r = state.rects[n];
    const st = $('.stage', slides[n]);
    st.style.width = r.w + 'px'; st.style.height = r.h + 'px';
    st.style.transform = `translate(${r.x}px,${r.y}px)`;
  }
  layoutAbout(); layoutViewer(); layoutFaq(); layoutRingUI();
  if (state.cur === 4) renderRing();
  if (seg.active) seg.recalc();
}

/* ------------------------------------------------------------ images */
function initImages() {
  for (const n of Object.keys(G.slides)) {
    const src = IMG + G.slides[n].img;
    $('.still', slides[n]).src = src;
    $('.bd', slides[n]).style.backgroundImage = `url("${src}")`;
  }
  $('.bd', slides[4]).style.backgroundImage = `url("${IMG}s4-plate.jpg")`;
  const gb = G.geo.girl; place($('.girl', slides[4]), gb, 4);
  // slide 1: winks + eye hit areas
  for (const eye of ['brown', 'blue']) {
    $$(`.wink.${eye}`, slides[1]).forEach(el => place(el, G.geo.eyes[eye], 1));
    place($(`.eye-hit[data-eye="${eye}"]`, slides[1]), G.geo.eyeHit[eye], 1);
  }
}

/* ------------------------------------------------------------ video preload */
const vurl = {};
const VQUEUE = ['t12', 't24', 't48', 't89', 't910', 't910_r', 't12_r', 't24_r', 't48_r', 't89_r'];
async function preloadVideos(onFirst) {
  for (const name of VQUEUE) {
    try {
      const res = await fetch(VID + name + '.mp4');
      if (!res.ok) throw 0;
      vurl[name] = URL.createObjectURL(await res.blob());
    } catch (e) { vurl[name] = VID + name + '.mp4'; }
    if (name === 't12' && onFirst) onFirst();
  }
}
const videoSrc = name => vurl[name] || (VID + name + '.mp4');

/* ------------------------------------------------------------ transition video (double-buffered) */
const vids = [$('#tv'), $('#tv2')];
let vcur = 0;                                   // index of the element that is (or was last) on screen
const vbd = $('#vbd'), vctx = vbd.getContext('2d');
const seg = { active: false, MA: null, MB: null, recalc: null, el: null };
/* While the card flies in the camera stands still: during that clip slide 6 is framed exactly like slide 4
   (so the girl behind the card never moves or grows); once the card is in front, the view eases to slide 6's own framing. */
function rect6v() {
  const r4 = state.rects[4], a = G.segs.t46.a, b = G.segs.t46.b, s6 = G.slides[6];
  const sc = r4.sc * b.s / a.s, th = a.rot * Math.PI / 180, k = r4.sc / a.s;
  const ox = r4.x - k * (Math.cos(th) * a.tx + Math.sin(th) * a.ty), oy = r4.y - k * (-Math.sin(th) * a.tx + Math.cos(th) * a.ty);
  return { x: ox + k * b.tx, y: oy + k * b.ty, sc, w: s6.w * sc, h: s6.h * sc };
}
/* Slide 6 is only the card (and the project in it) lying over slide 4, which stays exactly as it is.
   The card sits where the video put it, enlarged a little so the project reads well. */
const CARD6 = [580, 179, 1223, 818];          // the card in slide-6 picture px
function rect6card() {
  const rv = rect6v(), vw = innerWidth, vh = innerHeight;
  const cw = (CARD6[2] - CARD6[0]) * rv.sc, ch = (CARD6[3] - CARD6[1]) * rv.sc;
  const z = clamp(Math.min(vw * .9 / cw, vh * .86 / ch), .6, vw < vh ? 2.4 : 1);
  const mx = (CARD6[0] + CARD6[2]) / 2, my = (CARD6[1] + CARD6[3]) / 2;
  const cx = rv.x + mx * rv.sc;
  const cy = clamp(rv.y + my * rv.sc, ch * z / 2 + vh * .06, vh - ch * z / 2 - vh * .04);
  const sc = rv.sc * z, s6 = G.slides[6];
  return { x: cx - mx * sc, y: cy - my * sc, sc, w: s6.w * sc, h: s6.h * sc };
}
function cardBox() {
  const r = state.rects[6];
  return { x: r.x + CARD6[0] * r.sc, y: r.y + CARD6[1] * r.sc, w: (CARD6[2] - CARD6[0]) * r.sc, h: (CARD6[3] - CARD6[1]) * r.sc };
}
const flyer = $('#flyer');
function flyFrames(from, to, back) {
  const T = (r, rot, lift = 0) => `translate(${r.x + r.w / 2 - (to.x + to.w / 2)}px,${r.y + r.h / 2 - (to.y + to.h / 2) - lift}px) scale(${r.w / to.w},${r.h / to.h}) rotate(${rot}deg)`;
  const mix = (u) => ({ x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u, w: from.w + (to.w - from.w) * u, h: from.h + (to.h - from.h) * u });
  const lift = innerHeight * .05, rot = back ? 9 : -9;
  return [
    { transform: T(from, 0), offset: 0 },
    { transform: T(mix(.22), rot, lift), offset: .38 },
    { transform: T(mix(.7), rot * .35, lift * .4), offset: .72 },
    { transform: T(to, 0), offset: 1 }];
}
async function fly(from, to, back) {
  Object.assign(flyer.style, { left: to.x + 'px', top: to.y + 'px', width: to.w + 'px', height: to.h + 'px', display: 'block' });
  const an = flyer.animate(flyFrames(from, to, back), { duration: reduce ? 1 : 1150, easing: 'cubic-bezier(.55,0,.25,1)', fill: 'forwards' });
  await an.finished.catch(() => {});
  return an;
}
const tileBox = el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
async function openCard() {
  setBusy(true); closeDropdowns();
  const tile = $('.tile.active', slides[4]) || ring.tiles.find(t => t.row === 0 && t.k === ring.front)?.el;
  ring.flyTile = tile;
  slides[4].classList.add('carding');
  prepare(6);
  const from = tile ? tileBox(tile) : (() => { const c = cardBox(); return { x: c.x + c.w * .4, y: c.y + c.h * .6, w: c.w * .2, h: c.h * .2 }; })();
  if (tile) tile.style.visibility = 'hidden';
  const an = await fly(from, cardBox(), false);
  showSlide(6, true);
  flyer.style.display = 'none'; an.cancel();
  setCur(6);
  await enter(6);
  setBusy(false); state.needGap = true;
}
async function closeCard(after) {
  setBusy(true); closeDropdowns();
  await leave(6);
  const c = cardBox();
  Object.assign(flyer.style, { left: c.x + 'px', top: c.y + 'px', width: c.w + 'px', height: c.h + 'px', display: 'block' });
  hideSlide(6, true);
  const tile = ring.flyTile;
  const to = tile ? tileBox(tile) : { x: c.x + c.w * .4, y: c.y + c.h * .6, w: c.w * .2, h: c.h * .2 };
  // fly from the card back into the tile: animate an element placed at the tile, starting at the card
  Object.assign(flyer.style, { left: to.x + 'px', top: to.y + 'px', width: to.w + 'px', height: to.h + 'px' });
  const an = flyer.animate(flyFrames(c, to, true), { duration: reduce ? 1 : 1150, easing: 'cubic-bezier(.55,0,.25,1)', fill: 'forwards' });
  await an.finished.catch(() => {});
  if (tile) tile.style.visibility = '';
  flyer.style.display = 'none'; an.cancel();
  slides[4].classList.remove('carding');
  setCur(4); ring.flyTile = null;
  setBusy(false); state.needGap = true;
}
function cardCleanup() { // leaving the project by any other way
  if (ring.flyTile) ring.flyTile.style.visibility = '';
  ring.flyTile = null; slides[4].classList.remove('carding'); hideSlide(4);
}
function vmatrix(map, n, rr) {
  const r = rr || state.rects[n], k = r.sc / map.s, th = map.rot * Math.PI / 180;
  const a = k * Math.cos(th), c = k * Math.sin(th), b = -k * Math.sin(th), d = k * Math.cos(th);
  return [a, b, c, d, r.x - (a * map.tx + c * map.ty), r.y - (b * map.tx + d * map.ty)];
}
const ease = u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
function setMatrix(el, u) {
  const e = ease(u);
  const m = seg.MA.map((v, i) => v + (seg.MB[i] - v) * e);
  el.style.transform = `matrix(${m.join(',')})`;
}
function drawBackdrop(v) { try { vctx.drawImage(v, 0, 0, vbd.width, vbd.height); } catch (_) {} }
function videoReady(v) {
  return new Promise((res, rej) => {
    if (v.readyState >= 2) return res();
    const t = setTimeout(() => { cleanup(); rej(new Error('timeout')); }, 9000);
    const ok = () => { cleanup(); res(); };
    const bad = () => { cleanup(); rej(new Error('error')); };
    function cleanup() { clearTimeout(t); v.removeEventListener('loadeddata', ok); v.removeEventListener('error', bad); }
    v.addEventListener('loadeddata', ok); v.addEventListener('error', bad);
  });
}
function firstFrame(v) {
  return new Promise(res => {
    if ('requestVideoFrameCallback' in v) { v.requestVideoFrameCallback(() => res()); setTimeout(res, 500); }
    else { v.addEventListener('playing', () => setTimeout(res, 50), { once: true }); setTimeout(res, 500); }
  });
}
function hideVideos() {
  vids.forEach(v => { v.style.transition = 'none'; v.classList.remove('show'); v.pause(); });
  vbd.classList.remove('show'); seg.active = false;
}
/* opt.chained: the previous clip is still on screen (cut straight into this one)
   opt.hold:    keep this clip on screen at its last frame (another clip follows) */
async function runSeg(name, rev, from, to, opt = {}) {
  const s = G.segs[name];
  const mA = rev ? s.b : s.a, mB = rev ? s.a : s.b;
  const fadeIn = opt.chained ? 0 : ((rev ? s.fadeOut : s.fadeIn) || 0);
  const fadeOut = (rev ? s.fadeIn : s.fadeOut) || 240;
  const prev = vids[vcur], v = opt.chained ? vids[vcur ^ 1] : vids[vcur];
  v.style.transition = 'none'; v.classList.remove('show');
  v.style.zIndex = 2; if (prev !== v) prev.style.zIndex = 1;
  const src = videoSrc(name + (rev ? '_r' : ''));
  if (v.dataset.src !== src) { v.src = src; v.dataset.src = src; } else v.currentTime = 0;
  v.playbackRate = state.fast ? 2.2 : 1;
  await videoReady(v);
  seg.el = v;
  seg.recalc = () => { seg.MA = vmatrix(mA, from); seg.MB = vmatrix(mB, to); setMatrix(v, clamp(v.currentTime / (v.duration || 1), 0, 1)); };
  seg.MA = vmatrix(mA, from); seg.MB = vmatrix(mB, to); setMatrix(v, 0);
  seg.active = true;
  const p = v.play(); if (p) await p.catch(() => {});
  await firstFrame(v);
  v.style.transition = `opacity ${fadeIn}ms linear`;
  v.classList.add('show');
  await wait(fadeIn + 16);
  if (prev !== v) { prev.style.transition = 'none'; prev.classList.remove('show'); prev.pause(); }
  vcur = vids.indexOf(v);
  await new Promise(res => {
    let done = false;
    const finish = () => { if (!done) { done = true; res(); } };
    const tick = () => {
      if (done) return;
      const d = v.duration || 1, u = clamp(v.currentTime / d, 0, 1);
      setMatrix(v, u);
      if (v.ended || u >= .999) return finish();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    v.addEventListener('ended', finish, { once: true });
  });
  setMatrix(v, 1);
  prepare(to, name, rev);                 // the destination goes under the clip only now, at its last frame
  showSlide(to, true); hideSlide(from, true);
  if (opt.hold) return;
  v.style.transition = `opacity ${fadeOut}ms linear`;
  v.classList.remove('show');
  await wait(fadeOut);
  v.pause(); seg.active = false;
}
function speedUp() { state.fast = true; if (seg.active && seg.el) seg.el.playbackRate = 2.2; }

/* ------------------------------------------------------------ slides */
function showSlide(n, instant) {
  const el = slides[n];
  if (instant) { el.classList.add('instant'); el.classList.add('on'); el.offsetWidth; el.classList.remove('instant'); }
  else el.classList.add('on');
}
function hideSlide(n, instant) {
  const el = slides[n]; el.classList.remove('ready');
  if (instant) { el.classList.add('instant'); el.classList.remove('on'); el.offsetWidth; el.classList.remove('instant'); }
  else el.classList.remove('on');
}
function prepare(n, segName) {
  if (n === 4) ringPrepare(segName === 't48' || segName === 't24' ? 'empty' : 'blank');
}
async function leave(n, segName) {
  const el = slides[n];
  el.classList.remove('ready');
  if (n === 4) await ringLeave(segName === 't48' || segName === 't24' ? 'empty' : 'blank');
  else if (n === 6) { $$('video', $('#vMedia')).forEach(v => v.pause()); await wait(300); }
  else if (n === 2 || n === 10 || n === 1) await wait(180);
}
async function enter(n) {
  const el = slides[n];
  if (n === 6) renderViewer();
  el.classList.add('ready');
  if (n === 4) ringEnter();
}

function findSeg(a, b) {
  for (const [name, s] of Object.entries(G.segs)) {
    if (s.from === a && s.to === b) return { name, rev: false };
    if (s.from === b && s.to === a) return { name, rev: true };
  }
  return null;
}

function navFor(to) { body.classList.toggle('nav-off', to !== 1); if (to !== 1) closeDropdowns(); }
function setBusy(v) { state.busy = v; body.classList.toggle('busy', v); if (!v) state.fast = false; }
function setCur(n) {
  state.cur = n;
  body.className = body.className.replace(/\bon-\d+\b/g, '').trim() + ' on-' + n;
  body.classList.toggle('busy', state.busy);
  const dot = n === 6 ? 4 : n === 10 ? 9 : n;
  $$('#dots button').forEach(b => b.classList.toggle('cur', +b.dataset.n === dot));
  body.classList.toggle('no-hint', n === 9 || n === 6 || n === 10);
}

async function go(to) {
  if (state.busy || to === state.cur) return;
  if (state.cur === 4 && to === 6) return openCard();
  if (state.cur === 6 && to === 4) return closeCard();
  if (!findSeg(state.cur, to)) return jump(to);
  setBusy(true); navFor(to);
  await goStep(to, { first: true, last: true });
  setBusy(false); state.needGap = true;
}
async function travel(d) { // to the next stop, playing every clip on the way without stopping
  if (state.busy) return;
  const path = [];
  let i = ORDER.indexOf(state.cur);
  if (i < 0) return;
  do { i += d; if (i < 0 || i >= ORDER.length) break; path.push(ORDER[i]); } while (!STOPS.includes(ORDER[i]));
  if (!path.length || !STOPS.includes(path[path.length - 1])) return;
  setBusy(true); navFor(path[path.length - 1]);
  for (let k = 0; k < path.length; k++) await goStep(path[k], { first: k === 0, last: k === path.length - 1 });
  setBusy(false); state.needGap = true;
}
async function fadeStep(from, to, name, ms) { // a soft dissolve instead of a clip
  prepare(to, name);
  if (state.held) {        // the previous clip still shows its last frame: dissolve it into the next screen
    hideSlide(from, true); showSlide(to, true);
    const v = vids[vcur];
    v.style.transition = `opacity ${ms}ms cubic-bezier(.4,0,.2,1)`; v.classList.remove('show');
    await wait(ms); v.pause(); seg.active = false; state.held = false;
  } else {
    slides[to].style.zIndex = 3; slides[from].style.zIndex = 2;
    slides[to].style.transition = `opacity ${ms}ms cubic-bezier(.4,0,.2,1)`;
    showSlide(to); hideSlide(from);
    await wait(ms + 30);
    slides[to].style.zIndex = ''; slides[from].style.zIndex = ''; slides[to].style.transition = '';
  }
}
async function goStep(to, o) {
  const from = state.cur, s = findSeg(from, to);
  if (from === 1 && !state.cat) setCat('il');
  state.dir = ORDER.indexOf(to) > ORDER.indexOf(from) || to === 10 || to === 6 ? 1 : -1;
  closeDropdowns();
  if (o.first) await leave(from, s.name);
  if (G.segs[s.name].fade) await fadeStep(from, to, s.name, G.segs[s.name].fade);
  else try {
    if (reduce) throw new Error('reduced');
    await runSeg(s.name, s.rev, from, to, { chained: !!state.held, hold: !o.last });
    state.held = !o.last;
  } catch (e) {
    hideVideos(); state.held = false;
    prepare(to, s.name);
    showSlide(to); hideSlide(from); await wait(720);
  }
  setCur(to);
  if (o.last) await enter(to);
}

async function jump(to) {
  if (state.busy || to === state.cur) return;
  const from = state.cur;
  if (to === 4 && !state.cat) setCat('il');
  setBusy(true); closeDropdowns(); navFor(to);
  await leave(from, null);
  if (from === 6) cardCleanup();
  prepare(to, null);
  slides[to].style.zIndex = 3; slides[from].style.zIndex = 2;
  showSlide(to); hideSlide(from);
  await wait(760);
  slides[to].style.zIndex = ''; slides[from].style.zIndex = '';
  setCur(to);
  await enter(to);
  setBusy(false); state.needGap = true;
}

function next() {
  const c = state.cur;
  if (c === 6 || c === 10) return;
  travel(1);
}
function prev() {
  const c = state.cur;
  if (c === 10) return go(9);
  if (c === 6) return;
  travel(-1);
}
async function toFaq() {
  if (state.busy || state.cur === 10) return;
  if (state.cur !== 9) { await jump(9); await wait(150); }
  go(10);
}

/* ------------------------------------------------------------ slide 1: eyes + wink */
async function wink(eye) {
  const p = s => $(`.wink.${eye}.${s}`, slides[1]);
  const show = s => { $$(`.wink.${eye}`, slides[1]).forEach(e => e.classList.remove('show')); if (s) p(s).classList.add('show'); };
  const seq = [['a', 0], ['b', 40], ['c', 85], ['b', 260], ['a', 300], [null, 345]];
  let t = 0;
  for (const [s, at] of seq) { await wait(at - t); t = at; show(s); }
}
let choosing = false;
async function chooseEye(eye) {
  if (state.busy || choosing || state.cur !== 1) return;
  choosing = true;
  body.classList.add('chosen');
  setCat(eye === 'brown' ? 'il' : 'gd');
  await wink(eye);
  await wait(380);
  choosing = false;
  go(2);
  setTimeout(() => body.classList.remove('chosen'), 1500);
}

/* ------------------------------------------------------------ slide 2: about */
function initAbout() {
  const a = C.about;
  $('#aboutTitle').textContent = a.title;
  $('.about-text').textContent = a.text;
  $('.about-lead').textContent = a.approachLead;
  $('.about-list').innerHTML = a.approach.map(x => `<li>${x}</li>`).join('');
  $('.about-tail').textContent = a.approachTail;
  $('.about-outro').textContent = a.outro;
}
function layoutAbout() {
  const r = state.rects[2]; if (!r) return;
  const vw = innerWidth, vh = innerHeight, box = $('#about'), A = $('.about-a'), B = $('.about-b');
  const m = Math.max(20, vw * .035), gap = Math.max(24, vw * .02);
  const legsL = r.x + .355 * r.w, legsR = r.x + .665 * r.w;
  const availL = legsL - gap - m, availR = vw - m - (legsR + gap);
  const top = topSafe() + 10;
  [A, B].forEach(e => e.removeAttribute('style'));
  box.classList.remove('stacked');
  if (Math.min(availL, availR) >= 250) {
    const wA = Math.min(availL, 600), wB = Math.min(availR, 560);
    const f = Math.min(wA, wB);
    box.style.setProperty('--about-h', clamp(f * .095, 26, 64) + 'px');
    box.style.setProperty('--about-p', clamp(f * .066, 20, 38) + 'px');
    Object.assign(A.style, { left: m + 'px', width: wA + 'px', top: '50%', translate: '0 -62%' });
    Object.assign(B.style, { left: (legsR + gap) + 'px', width: wB + 'px', top: '50%', translate: '0 -38%' });
  } else {
    box.classList.add('stacked');
    box.style.setProperty('--about-h', clamp(vw * .062, 22, 30) + 'px');
    box.style.setProperty('--about-p', clamp(vw * .047, 17, 21) + 'px');
    Object.assign(A.style, { left: m + 'px', right: m + 'px', top: top + 'px' });
    Object.assign(B.style, { left: m + 'px', right: m + 'px', bottom: Math.max(56, vh * .07) + 'px' });
  }
}
function topSafe() { const tb = $('#topbar').getBoundingClientRect(); return tb.bottom; }

/* ------------------------------------------------------------ slide 4: ring
   Two rows of tiles on a 3D ring, fitted to the ring in the 3-4 video (same count, same places).
   The upper row carries the projects, the lower row is light only, as in the video. */
const RF = G.ring, RN = RF.N, STEP = Math.PI * 2 / RN, ALIGN = RF.ph[0] / STEP;
const ring = {
  cat: null, list: [], tiles: [], q: -ALIGN, target: -ALIGN, vel: 0,
  pop: 0, popT: 0, float: 0, floatT: 0, raf: 0, last: 0, drag: null, front: -1, t0: performance.now()
};
function thumbOf(p) {
  const f = PF[p.id];
  if (!f) return null;
  if (f.type === 'video') return { video: PRJ + f.files[0] };
  return { img: PRJ + (f.thumb || f.files[0]) };
}
function rproj(x, y, z) {
  const [cx, cy, Pd, al] = RF.p;
  const y2 = y * Math.cos(al) - z * Math.sin(al), z2 = y * Math.sin(al) + z * Math.cos(al), s = Pd / (Pd - z2);
  const X = cx + x * s, Y = cy + y2 * s, A = RF.A;   // A: screen-4 pixels -> extended still pixels
  return [A[0] * X + A[1] * Y + A[2], A[3] * X + A[4] * Y + A[5], z2];
}
function homography(q, W, H) { // unit square -> quad (Heckbert), as CSS matrix3d for a W x H element
  const [x0, y0] = q[0], [x1, y1] = q[1], [x2, y2] = q[2], [x3, y3] = q[3];
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3, dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) > 1e-9) { g = (dx3 * dy2 - dx2 * dy3) / den; h = (dx1 * dy3 - dx3 * dy1) / den; }
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
  return `matrix3d(${a / W},${d / W},0,${g / W},${b / H},${e / H},0,${h / H},0,0,1,0,${c},${f},0,1)`;
}
function buildRing() {
  ring.cat = state.cat;
  ring.list = C.projects[state.cat] || [];
  const back = $('.ring-back', slides[4]), front = $('#ringFront');
  back.innerHTML = ''; front.innerHTML = '';
  ring.tiles = [];
  for (let row = 0; row < 2; row++) {
    for (let k = 0; k < RN; k++) {
      const el = document.createElement('div');
      el.className = 'tile r' + row;
      el.innerHTML = `<div class="tface">${row === 0 ? '<img alt="" decoding="async">' : ''}<i class="tdim"></i></div>`;
      const t = { el, row, k, img: el.querySelector('img'), dim: el.querySelector('.tdim'), pid: -1, side: null };
      el.addEventListener('click', () => { if (ring.drag && ring.drag.moved) return; onTile(t); });
      front.appendChild(el); ring.tiles.push(t);
    }
  }
  ring.front = -1;
  $$('.cat-switch button').forEach(b => b.classList.toggle('cur', b.dataset.cat === state.cat));
  // warm the thumbnails of this direction
  ring.list.forEach(p => { const t = thumbOf(p); if (t && t.img) loadImg(t.img); });
  renderRing(); startRing();
}
const wrapJ = j => ((j % RN) + RN + RN / 2) % RN - RN / 2;
function projectFor(t) {
  const P = ring.list.length; if (!P) return -1;
  const base = Math.round(ring.q), j = wrapJ(t.k - base);
  return (((base + j) % P) + P) % P;
}
function renderRing() {
  const r = state.rects[4]; if (!r || !ring.tiles.length) return;
  const [, , , , R, h1, h2, R2] = RF.p;
  const now = (performance.now() - ring.t0) / 1000, sc = r.sc;
  const back = $('.ring-back', slides[4]), front = $('#ringFront');
  const mob = innerWidth < 760 ? 1.25 : 1;
  let activeK = -1;
  for (const t of ring.tiles) {
    const row = t.row, RR = row ? R2 : R, hh = row ? h2 : h1;
    const [tw, th] = RF.size[row];
    const phi = RF.ph[row] + (t.k - ring.q - ALIGN) * STEP;
    const sn = Math.sin(phi), cs = Math.cos(phi);
    const fy = Math.sin(now * .9 + t.k * .7 + row * 1.7) * 2.2 * ring.float;
    const cx = RR * sn, cz = RR * cs, cy = hh + fy;
    let tx = cs, tz = -sn; if (cs < 0) { tx = -tx; tz = -tz; }
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => {
      const p = rproj(cx + tx * u * tw / 2, cy + v * th / 2, cz + tz * u * tw / 2);
      return [p[0], p[1]];
    });
    const centre = rproj(cx, cy, cz);
    let quad = corners, z = centre[2], pop = 0;
    if (row === 0) {
      const j = Math.abs(wrapJ(t.k - ring.q));
      pop = clamp(1 - j / .62, 0, 1); pop = pop * pop * (3 - 2 * pop) * ring.pop;
      if (pop > .001) {
        const W = 112 * mob, H = 136 * mob, ox = centre[0], oy = centre[1] - 40 * pop;
        const rect = [[ox - W / 2, oy - H / 2], [ox + W / 2, oy - H / 2], [ox + W / 2, oy + H / 2], [ox - W / 2, oy + H / 2]];
        quad = corners.map((c, i) => [c[0] + (rect[i][0] - c[0]) * pop, c[1] + (rect[i][1] - c[1]) * pop]);
        z += 400 * pop;
      }
      if (j < .5) activeK = t.k;
      const pid = projectFor(t);
      if (pid !== t.pid && t.img) {
        t.pid = pid; const p = ring.list[pid], th_ = p && thumbOf(p);
        if (th_ && th_.img) t.img.src = th_.img; else t.img.removeAttribute('src');
        t.el.classList.toggle('vid', !!(th_ && th_.video));
      }
    }
    t.el.style.transform = homography(quad.map(([x, y]) => [x * sc, y * sc]), 100, 100);
    t.el.style.zIndex = Math.round(1000 + z);
    t.dim.style.opacity = (Math.max(0, -cs) * .42 + (1 - Math.abs(cs)) * .12).toFixed(3);
    if (row === 1) { // the video's lower row is open in front of her legs - keep that gap
      let a = Math.abs(Math.atan2(sn, cs)); a = clamp((a - .1) / .16, 0, 1);
      t.el.style.opacity = a < 1 ? a.toFixed(3) : '';
    }
    const side = cs >= 0 || pop > .02 ? front : back;
    if (t.side !== side) { side.appendChild(t.el); t.side = side; }
    t.el.classList.toggle('active', pop > .5);
  }
  if (activeK !== ring.front && activeK >= 0) {
    ring.front = activeK;
    const p = ring.list[activeIndex()];
    if (p) { $('#rtTitle').textContent = p.title; $('#rtMeta').textContent = p.meta; }
  }
}
const activeIndex = () => { const P = ring.list.length; return P ? (((Math.round(ring.target) % P) + P) % P) : 0; };
function startRing() {
  if (ring.raf) return;
  ring.last = performance.now();
  const tick = now => {
    const dt = Math.min(.05, (now - ring.last) / 1000); ring.last = now;
    if (!ring.drag) {
      const k = ring.leaving ? 140 : 55, c = 2 * Math.sqrt(k);
      ring.vel += ((ring.target - ring.q) * k - ring.vel * c) * dt;
      ring.q += ring.vel * dt;
      if (Math.abs(ring.target - ring.q) < 1e-4 && Math.abs(ring.vel) < 1e-4) ring.q = ring.target;
    }
    ring.pop += (ring.popT - ring.pop) * Math.min(1, dt * (ring.popT ? 7 : 14));
    ring.float += (ring.floatT - ring.float) * Math.min(1, dt * 2.5);
    if (slides[4].classList.contains('on')) renderRing();
    ring.raf = requestAnimationFrame(tick);
  };
  ring.raf = requestAnimationFrame(tick);
}
function rotateBy(d) { ring.target = Math.round(ring.target) + d; }
function onTile(t) {
  if (state.busy || state.cur !== 4) return;
  let k = t.k;
  if (t.row === 1) k = Math.round(t.k + (RF.ph[1] - RF.ph[0]) / STEP);
  const j = Math.round(wrapJ(k - ring.target));
  if (j === 0 && Math.abs(ring.q - ring.target) < .25) openProject(activeIndex());
  else ring.target = Math.round(ring.target) + j;
}
function openProject(i) {
  state.project = ring.list[i]; state.page = 0;
  go(6);
}
/* states: 'blank' = tiles exactly where the video has them, no pictures; 'empty' = no tiles at all */
function ringPrepare(mode) {
  if (!ring.tiles.length || ring.cat !== state.cat) buildRing();
  const el = slides[4];
  el.classList.add('snap');
  el.classList.remove('imgs');
  el.classList.toggle('nocards', mode === 'empty');
  el.offsetWidth; el.classList.remove('snap');
  ring.q = ring.target = Math.round(ring.q + ALIGN) - ALIGN; ring.vel = 0;
  ring.pop = ring.popT = 0; ring.float = ring.floatT = 0;
  renderRing();
}
async function ringEnter() {
  const el = slides[4];
  if (el.classList.contains('nocards')) {
    // the ring lights up from the front and runs round both sides to the back, the lower row a beat later
    const fd = t => {
      let a = RF.ph[t.row] + (t.k - ring.q - ALIGN) * STEP; a = Math.atan2(Math.sin(a), Math.cos(a));
      return Math.round(Math.abs(a) / Math.PI * 760 + t.row * 140) + 'ms';
    };
    ring.tiles.forEach(t => { t.el.style.transitionDelay = fd(t); t.el.querySelector('.tface').style.transitionDelay = fd(t); });
    el.classList.add('forming');
    el.classList.remove('nocards');
    await wait(1250);
    ring.tiles.forEach(t => { t.el.style.transitionDelay = ''; t.el.querySelector('.tface').style.transitionDelay = ''; });
    el.classList.remove('forming');
  }
  el.classList.add('imgs');
  ring.floatT = 1;
  ring.target = Math.round(ring.q + .5);   // settle: bring the nearest tile to the front
  await wait(260);
  ring.popT = 1;
}
async function ringLeave(mode) {
  const el = slides[4];
  ring.popT = 0; ring.floatT = 0; ring.leaving = true;
  el.classList.remove('imgs');
  ring.target = Math.round(ring.target + ALIGN) - ALIGN;   // back to the video's resting phase
  if (mode === 'empty') {
    ring.tiles.forEach(t => { t.el.style.transitionDelay = (((t.k + t.row * 7) % RN) * 12) + 'ms'; });
    el.classList.add('nocards');
  }
  const t0 = performance.now();
  while (performance.now() - t0 < 520 && (Math.abs(ring.q - ring.target) > .02 || ring.pop > .04)) await wait(20);
  ring.q = ring.target; ring.vel = 0; ring.pop = 0; ring.float = 0; ring.leaving = false;
  if (mode === 'empty') { await wait(120); ring.tiles.forEach(t => { t.el.style.transitionDelay = ''; }); }
  renderRing();
}
function initRingInput() {
  const st = $('.stage', slides[4]);
  st.addEventListener('pointerdown', e => {
    if (state.cur !== 4 || state.busy) return;
    ring.drag = { x: e.clientX, q: ring.q, moved: false, t: performance.now(), lx: e.clientX, v: 0, id: e.pointerId };
  });
  addEventListener('pointermove', e => {
    const d = ring.drag; if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) > 7) { d.moved = true; try { st.setPointerCapture(e.pointerId); } catch (_) {} }
    if (!d.moved) return;
    const unit = RF.p[4] * state.rects[4].sc * STEP * 1.25;
    const now = performance.now();
    d.v = (e.clientX - d.lx) / Math.max(1, now - d.t) * 1000 / unit; d.t = now; d.lx = e.clientX;
    ring.q = d.q - dx / unit; ring.target = ring.q; ring.vel = 0;
  });
  const end = () => {
    const d = ring.drag; if (!d) return;
    if (d.moved) { ring.target = Math.round(ring.q - clamp(d.v, -6, 6) * .18); setTimeout(() => { ring.drag = null; }, 0); }
    else ring.drag = null;
  };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);
  $('#ringPrev').addEventListener('click', () => rotateBy(-1));
  $('#ringNext').addEventListener('click', () => rotateBy(1));
  $('#ringOpen').addEventListener('click', () => { if (!state.busy && state.cur === 4) openProject(activeIndex()); });
  $$('.cat-switch button').forEach(b => b.addEventListener('click', async () => {
    if (b.dataset.cat === state.cat || state.busy) return;
    slides[4].classList.remove('imgs'); await wait(380);
    setCat(b.dataset.cat);
    slides[4].classList.add('imgs');
  }));
}
function layoutRingUI() {
  const r = state.rects[4]; if (!r) return;
  const gapBottom = innerHeight - (r.y + r.h);
  document.documentElement.style.setProperty('--stage-bottom-gap', Math.max(0, gapBottom) + 'px');
  const cap = $('.ring-caption');
  if (innerWidth < 760) { cap.style.bottom = 'auto'; cap.style.top = Math.max(topSafe() + 14, r.y - 10 - cap.offsetHeight) + 'px'; }
  else cap.style.top = '';
}
function setCat(c) {
  state.cat = c;
  if (ring.cat !== c) {
    const keep = ring.tiles.length > 0;
    if (keep) { ring.cat = c; ring.list = C.projects[c] || []; ring.tiles.forEach(t => { t.pid = -1; }); ring.front = -1;
      $$('.cat-switch button').forEach(b => b.classList.toggle('cur', b.dataset.cat === c));
      ring.list.forEach(p => { const t = thumbOf(p); if (t && t.img) loadImg(t.img); }); renderRing(); }
    else buildRing();
  }
}

/* ------------------------------------------------------------ slide 6: viewer */
function pagesOf(p) {
  const f = PF[p.id]; if (!f) return [];
  return f.files.map(x => ({ src: PRJ + x, type: f.type === 'video' ? 'video' : f.type === 'pdf' ? 'pdf' : 'img' }));
}
function renderViewer() {
  const p = state.project; if (!p) return;
  $('#vTitle').textContent = p.title; $('#vMeta').textContent = p.meta;
  renderPage(false);
}
function mediaEl(pg, big) {
  if (pg.type === 'video') {
    const v = document.createElement('video'); v.src = pg.src; v.controls = true; v.playsInline = true; v.preload = 'metadata';
    if (big) v.autoplay = true;
    return v;
  }
  if (pg.type === 'pdf') {
    const a = document.createElement('a'); a.href = pg.src; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Открыть PDF'; a.className = 'pdf-link'; return a;
  }
  const img = document.createElement('img'); img.src = pg.src; img.alt = state.project ? state.project.title : ''; img.decoding = 'async';
  return img;
}
async function renderPage(animate) {
  const p = state.project, pages = pagesOf(p), box = $('#vMedia');
  const pg = pages[state.page] || pages[0];
  if (animate) { box.classList.add('fading'); await wait(220); }
  $$('video', box).forEach(v => v.pause());
  box.innerHTML = '';
  if (pg) {
    const el = mediaEl(pg, false);
    if (el.tagName === 'IMG') { el.addEventListener('click', openLightbox); el.style.opacity = 0; el.onload = () => { el.style.opacity = 1; }; }
    box.appendChild(el);
  }
  box.classList.remove('fading');
  const multi = pages.length > 1;
  $('#vPager').hidden = !multi;
  $('#vCount').textContent = multi ? `${state.page + 1} из ${pages.length}` : '';
}
function pageBy(d) {
  const n = pagesOf(state.project).length; if (n < 2) return;
  state.page = (state.page + d + n) % n; renderPage(true);
}
function layoutViewer() {
  const r = state.rects[6]; if (!r) return;
  const v = $('#viewer'); place(v, G.geo.card6, 6); place($('#flycard'), CARD6, 6);
  const cw = (G.geo.card6[2] - G.geo.card6[0]) * r.sc;
  v.style.setProperty('--v-h', clamp(cw * .052, 15, 34) + 'px');
  v.style.setProperty('--v-p', clamp(cw * .032, 12, 20) + 'px');
  v.style.setProperty('--v-btn', clamp(cw * .062, 28, 44) + 'px');
}
function closeProject() { if (state.cur === 6 && !state.busy) go(4); }

/* ------------------------------------------------------------ lightbox */
const lb = $('#lightbox');
function openLightbox() {
  if (!state.project) return;
  lb.hidden = false; requestAnimationFrame(() => lb.classList.add('open'));
  drawLightbox();
}
function drawLightbox() {
  const pages = pagesOf(state.project), pg = pages[state.page], box = $('#lbMedia');
  box.innerHTML = ''; if (pg) box.appendChild(mediaEl(pg, true));
  const multi = pages.length > 1;
  $('#lbPrev').hidden = $('#lbNext').hidden = !multi;
  $('#lbCount').textContent = multi ? `${state.page + 1} из ${pages.length}` : state.project.title;
}
function closeLightbox() {
  lb.classList.remove('open'); $$('video', lb).forEach(v => v.pause());
  setTimeout(() => { lb.hidden = true; $('#lbMedia').innerHTML = ''; }, 320);
  renderPage(false);
}

/* ------------------------------------------------------------ slide 9: papers */
function initPapers() {
  const st = $('#papersStage'), L = C.links;
  const gmail = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(L.email) + '&su=' + encodeURIComponent(L.emailSubject);
  const defs = [
    ['telegram', L.telegram, '@ritavtyurina', 'Telegram'],
    ['instagram', L.instagram, '@vtyurina_rita', 'Instagram'],
    ['vk', L.vk, 'vk.ru/ritavtyurina', 'ВКонтакте'],
    ['email', gmail, 'написать письмо', 'Написать письмо на ' + L.email],
    ['faq', null, 'частые вопросы', 'Частые вопросы']
  ];
  defs.forEach(([key, href, tip, label], i) => {
    const el = document.createElement(href ? 'a' : 'button');
    el.style.setProperty('--d', (i * .09 + .1) + 's');
    el.className = 'paper ' + key;
    if (href) { el.href = href; el.target = '_blank'; el.rel = 'noopener'; } else el.type = 'button';
    el.setAttribute('aria-label', label);
    el.innerHTML = `<img src="${IMG}paper-${key}.webp" alt=""><span class="tip">${tip}</span>`;
    place(el, G.geo.papers[key], 9);
    if (key === 'faq') el.addEventListener('click', () => go(10));
    st.appendChild(el);
  });
}

/* ------------------------------------------------------------ slide 10: FAQ */
function initFaq() {
  $('#faqCols').innerHTML = C.faq.map(s => `<section class="faq-sec"><h3>${s.section}</h3>${s.items.map(([q, a]) =>
    `<div class="faq-item"><p class="faq-q">${q}</p><p class="faq-a">${a}</p></div>`).join('')}</section>`).join('');
  $('#faqBack').addEventListener('click', () => go(9));
}
function layoutFaq() {
  const r = state.rects[10]; if (!r) return;
  const P = G.geo.paper10, vw = innerWidth, vh = innerHeight;
  let x0 = r.x + P[0] * r.sc, y0 = r.y + P[1] * r.sc, x1 = r.x + P[2] * r.sc, y1 = r.y + P[3] * r.sc;
  const pw = x1 - x0, ph = y1 - y0;
  x0 += pw * .05; x1 -= pw * .05; y0 += ph * .07; y1 -= ph * .06;
  x0 = Math.max(x0, 18); x1 = Math.min(x1, vw - 26);
  y0 = Math.max(y0, topSafe() + 16); y1 = Math.min(y1, vh - 24);
  y1 -= 40; // room for the back link
  const f = $('#faq');
  Object.assign(f.style, { left: x0 + 'px', top: y0 + 'px', width: (x1 - x0) + 'px', height: (y1 - y0) + 'px' });
  const w = x1 - x0;
  const one = w < 640, cols = one ? 1 : w > 980 ? 3 : 2;
  const cw = w / cols;
  const base = { h: one ? w * .066 : cw * .074, q: one ? w * .05 : cw * .053, a: one ? w * .039 : cw * .041 };
  const setF = k => {
    f.style.setProperty('--faq-h', clamp(base.h * k, 16, 38) + 'px');
    f.style.setProperty('--faq-q', clamp(base.q * k, 12.5, 26) + 'px');
    f.style.setProperty('--faq-a', clamp(base.a * k, 11, 18) + 'px');
  };
  setF(1);
  // the crease map covers the whole sheet; place it under the text box
  const map = $('#inkMap'), flt = $('#ink');
  if (map && window.CRUMPLE) {
    if (!map.getAttribute('href')) map.setAttribute('href', window.CRUMPLE);
    const px = r.x + P[0] * r.sc, py = r.y + P[1] * r.sc;
    Object.entries({ x: px - x0, y: py - y0, width: pw, height: ph }).forEach(([k, v]) => map.setAttribute(k, v.toFixed(1)));
    Object.entries({ x: -30, y: -30, width: w + 60, height: (y1 - y0) + 60 }).forEach(([k, v]) => flt.setAttribute(k, v.toFixed(1)));
    $('feDisplacementMap', flt).setAttribute('scale', clamp(pw * .0055, 3, 7).toFixed(2));
  }
  $('#faqCols').style.columnCount = cols;
  if (!one) { // shrink type until everything fits on the paper
    const sc = $('#faqScroll'); let k = 1;
    for (let i = 0; i < 18 && sc.scrollHeight > sc.clientHeight + 2; i++) { k *= .95; setF(k); }
  }}

/* ------------------------------------------------------------ header */
function initHeader() {
  const L = C.links;
  $('#lnkTg').href = L.telegram; $('#lnkIg').href = L.instagram; $('#lnkVk').href = L.vk;
  $('#ddSkills').innerHTML = C.skills.map(s => `<li>${s}</li>`).join('');
  for (const [btn, panel] of [['#btnContacts', '#ddContacts'], ['#btnSkills', '#ddSkills']]) {
    $(btn).addEventListener('click', e => {
      e.stopPropagation();
      const p = $(panel), open = p.hidden;
      closeDropdowns();
      if (open) { p.hidden = false; requestAnimationFrame(() => p.classList.add('open')); $(btn).setAttribute('aria-expanded', 'true'); }
    });
  }
  document.addEventListener('click', e => { if (!e.target.closest('.dd')) closeDropdowns(); });
  $('#btnFaq').addEventListener('click', toFaq);
  $('#logoBtn').addEventListener('click', () => jump(1));
  $('#hint').addEventListener('click', next);
  $('#dots').innerHTML = STOPS.map((n, i) => `<button type="button" data-n="${n}" aria-label="Экран ${i + 1} из ${STOPS.length}"></button>`).join('');
  $$('#dots button').forEach(b => b.addEventListener('click', () => {
    const n = +b.dataset.n, c = state.cur === 6 ? 4 : state.cur === 10 ? 9 : state.cur;
    if (n === c || state.busy) return;
    const adj = Math.abs(STOPS.indexOf(n) - STOPS.indexOf(c)) === 1 && state.cur !== 6 && state.cur !== 10;
    adj ? travel(STOPS.indexOf(n) > STOPS.indexOf(c) ? 1 : -1) : jump(n);
  }));
  slides[2].addEventListener('click', () => { if (state.cur === 2 && !state.busy) next(); });
}
function closeDropdowns() {
  $$('.dd-panel').forEach(p => { p.classList.remove('open'); p.hidden = true; });
  $$('#btnContacts,#btnSkills').forEach(b => b.setAttribute('aria-expanded', 'false'));
}

/* ------------------------------------------------------------ input */
function initInput() {
  let acc = 0, accX = 0, last = 0, lockUntil = 0;
  addEventListener('wheel', e => {
    if (!lb.hidden) return;
    const now = performance.now(), gapOk = now - last > 200;
    const unit = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? innerHeight : 1;
    const dx = e.deltaX * unit, dy = e.deltaY * unit;
    if (state.cur === 10) {
      const sc = $('#faqScroll');
      if (sc.contains(e.target) && Math.abs(dy) >= Math.abs(dx)) {
        const atTop = sc.scrollTop <= 1, atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;
        if ((dy < 0 && !atTop) || (dy > 0 && !atBottom)) { last = now; state.needGap = true; return; }
      }
    }
    e.preventDefault();
    if (gapOk) { acc = 0; accX = 0; state.needGap = false; }
    last = now;
    if (state.cur === 4 && !state.busy && Math.abs(dx) > Math.abs(dy)) {
      accX += dx;
      if (Math.abs(accX) > 60) { rotateBy(Math.sign(accX)); accX = 0; }
      return;
    }
    acc += dy;
    if (state.busy) { if (Math.sign(dy) === state.dir && Math.abs(acc) > 80) speedUp(); return; }
    if (state.needGap || now < lockUntil || state.cur === 6) return;
    if (Math.abs(acc) > 30) {
      const d = Math.sign(acc); acc = 0; lockUntil = now + 450;
      d > 0 ? next() : prev();
    }
  }, { passive: false });

  addEventListener('keydown', e => {
    if (!lb.hidden) {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowRight') { pageBy(1); drawLightbox(); }
      if (e.key === 'ArrowLeft') { pageBy(-1); drawLightbox(); }
      return;
    }
    if (e.key === 'Escape') { closeDropdowns(); if (state.cur === 6) closeProject(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (state.cur === 4 && !state.busy) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); return rotateBy(-1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); return rotateBy(1); }
      if (e.key === 'Enter' && (tag === 'body' || e.target.closest('#ringFront'))) { e.preventDefault(); return openProject(activeIndex()); }
    }
    if (state.cur === 6) {
      if (e.key === 'ArrowLeft') return pageBy(-1);
      if (e.key === 'ArrowRight') return pageBy(1);
      return;
    }
    if (state.busy) { if (['ArrowDown', 'PageDown', ' '].includes(e.key)) speedUp(); return; }
    if (state.cur === 10 && $('#faqScroll').contains(e.target)) return;
    if (['ArrowDown', 'PageDown'].includes(e.key) || (e.key === ' ' && tag === 'body')) { e.preventDefault(); next(); }
    if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); prev(); }
  });

  let ts = null;
  addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return (ts = null);
    ts = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now(), target: e.target };
  }, { passive: true });
  addEventListener('touchend', e => {
    if (!ts || !lb.hidden) return;
    const t = e.changedTouches[0], dx = t.clientX - ts.x, dy = t.clientY - ts.y;
    const target = ts.target; ts = null;
    if (Math.abs(dy) < 50 || Math.abs(dy) < Math.abs(dx) * 1.2) return;
    if (state.cur === 6) return;
    if (state.cur === 10) {
      const sc = $('#faqScroll');
      if (sc.contains(target) && sc.scrollHeight > sc.clientHeight + 2) {
        const atTop = sc.scrollTop <= 1;
        if (!(dy > 0 && atTop)) return;
      }
    }
    if (state.busy) { speedUp(); return; }
    dy < 0 ? next() : prev();
  }, { passive: true });

  $$('.eye-hit').forEach(b => b.addEventListener('click', () => chooseEye(b.dataset.eye)));
  $('#vClose').addEventListener('click', closeProject);
  $('#vPrev').addEventListener('click', () => pageBy(-1));
  $('#vNext').addEventListener('click', () => pageBy(1));
  $('#vExpand').addEventListener('click', openLightbox);
  $('#lbClose').addEventListener('click', closeLightbox);
  $('#lbPrev').addEventListener('click', () => { pageBy(-1); drawLightbox(); });
  $('#lbNext').addEventListener('click', () => { pageBy(1); drawLightbox(); });
  lb.addEventListener('click', e => { if (e.target === lb || e.target.id === 'lbMedia') closeLightbox(); });
  let rt; addEventListener('resize', () => { cancelAnimationFrame(rt); rt = requestAnimationFrame(layout); });
}

/* ------------------------------------------------------------ boot */
function loadImg(src) { return new Promise(r => { const i = new Image(); i.onload = i.onerror = () => r(); i.src = src; }); }
async function boot() {
  $('#ringTitle').textContent = C.ringCaption;
  initImages(); initAbout(); initPapers(); initFaq(); initHeader(); initRingInput(); initInput();
  setCur(1); layout();
  const pct = $('#loaderPct'), ldTiles = $$('#ldTiles i');
  // loading screen: the name types itself, tiles light up with progress
  const name = C.name.toUpperCase(), typeEl = $('#ldType');
  const typed = (async () => { await wait(350); for (let i = 1; i <= name.length; i++) { typeEl.textContent = name.slice(0, i); await wait(name[i - 1] === ' ' ? 120 : 62); } })();
  let target = 0, shown = 0, lastT = performance.now();
  const setP = p => { target = Math.max(target, p); };
  const ldTick = now => {   // the counter runs up smoothly, so the tiles light one after another
    const dt = (now - lastT) / 1000; lastT = now;
    shown = Math.min(target, shown + dt * 75);
    pct.textContent = Math.round(shown);
    const on = Math.round(shown / 100 * ldTiles.length);
    ldTiles.forEach((t, i) => t.classList.toggle('on', i < on));
    if (shown < 100) requestAnimationFrame(ldTick);
  };
  requestAnimationFrame(ldTick);
  const essentials = ['s1.jpg', 'wink-brown-a.webp', 'wink-brown-b.webp', 'wink-brown-c.webp', 'wink-blue-a.webp', 'wink-blue-b.webp', 'wink-blue-c.webp'];
  let done = 0; const total = essentials.length + 2;
  const tickP = () => { done++; setP(done / total * 100); };
  let firstVideo;
  const videoGate = new Promise(r => { firstVideo = r; });
  preloadVideos(() => { tickP(); firstVideo(); });
  await Promise.race([
    Promise.all([...essentials.map(s => loadImg(IMG + s).then(tickP)), document.fonts.ready.then(tickP), videoGate, wait(1900)]),
    wait(9000)
  ]);
  await Promise.race([typed, wait(1500)]);
  layout();
  setP(100);
  while (shown < 100) await wait(50);
  await wait(380);
  showSlide(1); slides[1].classList.add('ready');
  $('#loader').classList.add('done');
  // warm the rest of the stills
  ['s2.jpg', 's4.jpg', 's4-plate.jpg', 's4-girl.webp', 's6.jpg', 's8.jpg', 's9.jpg', 's10.jpg'].forEach(s => loadImg(IMG + s));
}
boot();
})();
