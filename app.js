"use strict";

/* ─── The position ─────────────────────────────────────────────── */

const OUNCES = 1.2055;            // 1 damleung = 37.5 g
const CHI = 10;                   // 1 damleung = 10 chi
const DEFAULT_PURCHASE_USD = 5585;
const PURCHASE_SPOT = 4548;
const DEFAULT_KHR_RATE = 4010;

const SEED_HISTORY = [
  { date: "2026-05-15", spot: 4548 },
  { date: "2026-05-27", spot: 4490 },
  { date: "2026-05-28", spot: 4457 },
  { date: "2026-06-07", spot: 4341 },
  { date: "2026-06-10", spot: 4200 },
  { date: "2026-06-11", spot: 4082 },
  { date: "2026-06-13", spot: 4224 },
  { date: "2026-06-15", spot: 4340 },
  { date: "2026-06-16", spot: 4357 },
  { date: "2026-06-17", spot: 4333 },
  { date: "2026-06-19", spot: 4169 },
  { date: "2026-06-21", spot: 4156 },
  { date: "2026-06-23", spot: 4129 },
  { date: "2026-06-25", spot: 4000 },
  { date: "2026-07-01", spot: 4026 },
  { date: "2026-07-03", spot: 4187 },
  { date: "2026-07-11", spot: 4119 },
];

// Same keys as the first version, so saved data carries over.
const STORE = {
  HISTORY: "goldDashboard.history",
  KHR_RATE: "goldDashboard.khrRate",
  LAST_SPOT: "goldDashboard.lastSpot",
  PURCHASE_USD: "goldDashboard.purchaseUsd",
  THEME: "goldkh.theme",
};

/* ─── Helpers ──────────────────────────────────────────────────── */

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const fmtUSD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtUSDc = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const fmtDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const fmtDayShort = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const fmtMonth = new Intl.DateTimeFormat("en-GB", { month: "short" });
const fmtTime = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

const MINUS = "−";
const sign = (v) => (v >= 0 ? "+" : MINUS);
const fmtKHR = (v) => fmtNum.format(Math.round(v)) + " ៛";
const fmtSignedUSD = (v) => sign(v) + fmtUSD.format(Math.abs(v));
const fmtSignedKHR = (v) => sign(v) + fmtKHR(Math.abs(v));
const fmtPct = (v) => sign(v) + Math.abs(v).toFixed(2) + "%";
const dayOf = (iso) => new Date(iso + "T00:00:00");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function khrRate() {
  const v = parseFloat($("khr-rate").value);
  return v > 0 ? v : DEFAULT_KHR_RATE;
}
function purchaseUsd() {
  const v = parseFloat($("purchase-price").value);
  return v > 0 ? v : DEFAULT_PURCHASE_USD;
}
const breakEven = () => purchaseUsd() / OUNCES;

function position(spot) {
  const value = spot * OUNCES;
  const pnl = value - purchaseUsd();
  return { value, pnl, pct: (pnl / purchaseUsd()) * 100 };
}

function settle(el) {
  el.classList.remove("settle");
  void el.offsetWidth;
  el.classList.add("settle");
}

/* ─── State ────────────────────────────────────────────────────── */

const state = {
  spot: null,
  source: { kind: "saved", text: "" },
  whatIf: null,      // a price the user is trying out
  scrub: null,       // a day from the chart, { date, spot }
};
const previousCheck = loadJSON(STORE.LAST_SPOT, null);

const shownSpot = () =>
  state.scrub ? state.scrub.spot : state.whatIf !== null ? state.whatIf : state.spot;

function mergedHistory() {
  const saved = loadJSON(STORE.HISTORY, []);
  const byDate = new Map();
  for (const p of SEED_HISTORY) byDate.set(p.date, p.spot);
  for (const p of saved) if (p && p.date && p.spot > 0) byDate.set(p.date, p.spot);
  return [...byDate.entries()]
    .map(([date, spot]) => ({ date, spot }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function persistTodayPoint(spot) {
  const today = todayISO();
  const saved = loadJSON(STORE.HISTORY, []).filter((p) => p.date !== today);
  saved.push({ date: today, spot });
  saveJSON(STORE.HISTORY, saved);
}

/* ─── The scale ────────────────────────────────────────────────── */

const PIVOT = { x: 320, y: 96 };
const ARM = 224;
const MAX_TILT = 16;          // degrees, where the beam hits its stop
const DEG_PER_PCT = 0.9;      // 1% P&L tips the beam 0.9°

const scale = {
  svg: $("scale"),
  beam: $("beam"),
  left: $("pan-left"),
  right: $("pan-right"),
  angle: 0,
  vel: 0,
  target: 0,
  raf: 0,
  last: 0,
  dragging: false,
};

const angleFor = (pct) => clamp(pct * DEG_PER_PCT, -MAX_TILT, MAX_TILT);
const spotForAngle = (deg) => (purchaseUsd() * (1 + deg / DEG_PER_PCT / 100)) / OUNCES;

function drawScale() {
  const a = scale.angle;
  const r = (a * Math.PI) / 180;
  const dx = ARM * Math.cos(r);
  const dy = ARM * Math.sin(r);
  scale.beam.setAttribute("transform", `rotate(${a.toFixed(3)} ${PIVOT.x} ${PIVOT.y})`);
  scale.left.setAttribute("transform", `translate(${(PIVOT.x - dx).toFixed(2)} ${(PIVOT.y - dy).toFixed(2)})`);
  scale.right.setAttribute("transform", `translate(${(PIVOT.x + dx).toFixed(2)} ${(PIVOT.y + dy).toFixed(2)})`);
}

function stepScale(now) {
  const dt = Math.min(0.033, (now - scale.last) / 1000 || 0.016);
  scale.last = now;
  // damped spring: a brass beam settling, a little overshoot, then still
  const k = 150, c = 17;
  const acc = -k * (scale.angle - scale.target) - c * scale.vel;
  scale.vel += acc * dt;
  scale.angle += scale.vel * dt;
  drawScale();
  if (Math.abs(scale.angle - scale.target) < 0.01 && Math.abs(scale.vel) < 0.02) {
    scale.angle = scale.target;
    scale.vel = 0;
    drawScale();
    scale.raf = 0;
    return;
  }
  scale.raf = requestAnimationFrame(stepScale);
}

function setScaleTarget(deg) {
  scale.target = deg;
  if (scale.dragging || reduceMotion.matches) {
    cancelAnimationFrame(scale.raf);
    scale.raf = 0;
    scale.angle = deg;
    scale.vel = 0;
    drawScale();
    return;
  }
  if (!scale.raf) {
    scale.last = performance.now();
    scale.raf = requestAnimationFrame(stepScale);
  }
}

function drawDial() {
  const g = $("dial");
  const R1 = 62, R2 = 72;
  let html = "";
  for (let d = -MAX_TILT; d <= MAX_TILT; d += 2) {
    const r = ((90 - d) * Math.PI) / 180;
    const major = d % 8 === 0;
    const r1 = major ? R1 - 4 : R1;
    const x1 = PIVOT.x + r1 * Math.cos(r), y1 = PIVOT.y + r1 * Math.sin(r);
    const x2 = PIVOT.x + R2 * Math.cos(r), y2 = PIVOT.y + R2 * Math.sin(r);
    const cls = d === 0 ? "dial-zero" : major ? "dial-tick major" : "dial-tick";
    html += `<line class="${cls}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  g.innerHTML = html;
}

// Tip the scale by hand: drag either pan up or down.
(function wireScaleDrag() {
  const svg = scale.svg;
  let start = null;

  function toSvg(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  svg.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const p = toSvg(e);
    start = { y: p.y, side: p.x >= PIVOT.x ? 1 : -1, angle: scale.angle };
    scale.dragging = true;
    cancelAnimationFrame(scale.raf);
    scale.raf = 0;
    svg.setPointerCapture(e.pointerId);
    svg.classList.add("is-dragging");
  });

  svg.addEventListener("pointermove", (e) => {
    if (!start) return;
    const p = toSvg(e);
    const deg = clamp(start.angle + (((p.y - start.y) * start.side) / ARM) * (180 / Math.PI), -MAX_TILT, MAX_TILT);
    scale.angle = deg;
    scale.vel = 0;
    drawScale();
    state.scrub = null;
    state.whatIf = Math.round(spotForAngle(deg));
    renderStage({ fromDrag: true });
  });

  function end(e) {
    if (!start) return;
    start = null;
    scale.dragging = false;
    svg.classList.remove("is-dragging");
    if (e && svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  }
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", end);
})();

/* ─── Rendering ────────────────────────────────────────────────── */

function renderStage(opts = {}) {
  if (state.spot === null) return;
  const stage = $("stage");
  const spot = shownSpot();
  const { value, pnl, pct } = position(spot);
  const rate = khrRate();
  const purchase = purchaseUsd();
  const be = breakEven();
  const mode = state.scrub ? "scrub" : state.whatIf !== null ? "whatif" : "now";

  stage.dataset.mode = mode;
  stage.dataset.mood = pnl >= 0 ? "profit" : "loss";

  let context;
  if (mode === "scrub") context = `On ${fmtDay.format(dayOf(state.scrub.date))}, gold was ${fmtUSD.format(spot)}/oz`;
  else if (mode === "whatif") context = `If gold were ${fmtUSD.format(spot)}/oz`;
  else context = state.source.kind === "live"
    ? `Right now · gold at ${fmtUSDc.format(spot)}/oz`
    : `${state.source.text} · gold at ${fmtUSDc.format(spot)}/oz`;
  $("context").textContent = context;

  $("pnl-word").textContent = pnl >= 0 ? "Up" : "Down";
  $("pnl-big").textContent = fmtSignedUSD(pnl);
  $("pnl-pct").textContent = fmtPct(pct);
  $("pnl-khr").textContent = fmtSignedKHR(pnl * rate);

  $("paid-usd").textContent = fmtUSD.format(purchase);
  $("paid-khr").textContent = fmtKHR(purchase * rate);
  $("worth-label").textContent = mode === "now" ? "Worth now" : mode === "scrub" ? "Was worth" : "Would be worth";
  $("worth-usd").textContent = fmtUSD.format(value);
  $("worth-khr").textContent = fmtKHR(value * rate);

  const gap = be - spot;
  const verb = mode === "now" ? "needs" : "would need";
  $("break-even-gap").innerHTML = gap > 0
    ? `Gold ${verb} to rise <strong>${fmtUSD.format(gap)}/oz</strong> (+${((gap / spot) * 100).toFixed(1)}%) to <strong>${fmtUSD.format(be)}</strong> before you break even.`
    : gap === 0
      ? `Exactly at break-even, <strong>${fmtUSD.format(be)}/oz</strong>.`
      : `That's <strong>${fmtUSD.format(-gap)}/oz</strong> above your break-even of <strong>${fmtUSD.format(be)}</strong>. Selling at this price takes a profit.`;

  // the slider follows whatever the scale shows, unless the user is holding it
  const slider = $("whatif");
  if (document.activeElement !== slider || mode !== "whatif") slider.value = Math.round(spot);
  $("whatif-out").textContent = fmtUSD.format(spot);
  $("whatif-reset").hidden = state.whatIf === null;
  $("whatif-hint").hidden = state.whatIf !== null;

  if (!opts.fromDrag) setScaleTarget(angleFor(pct));
  if (opts.settle) settle($("pnl-big"));
}

function renderBoard() {
  if (state.spot === null) return;
  $("spot-price").textContent = fmtUSDc.format(state.spot);

  const el = $("change-since");
  if (state.source.kind === "saved") {
    el.textContent = `${state.source.text}. Check the price to see today's move.`;
  } else if (previousCheck && previousCheck.spot > 0 && previousCheck.spot !== state.spot) {
    const diff = state.spot - previousCheck.spot;
    const when = fmtDayShort.format(new Date(previousCheck.time));
    el.innerHTML = `<span class="${diff >= 0 ? "up" : "down"}">${diff >= 0 ? "Up" : "Down"} ${fmtUSD.format(Math.abs(diff))}/oz</span> since your last check on ${when}`;
  } else if (previousCheck && previousCheck.spot === state.spot) {
    el.textContent = "Same as your last check.";
  } else {
    el.textContent = "Your first check. Next time you'll see what changed.";
  }
}

function renderReceipt() {
  const be = breakEven();
  const premium = purchaseUsd() - PURCHASE_SPOT * OUNCES;
  $("fact-be").textContent = `${fmtUSD.format(be)}/oz`;
  $("fact-bought").textContent = `${fmtUSD.format(PURCHASE_SPOT)}/oz`;
  $("fact-premium").textContent = fmtSignedUSD(premium);
  if (state.spot !== null) {
    $("fact-chi").textContent = fmtKHR((state.spot * OUNCES * khrRate()) / CHI);
  }
}

function renderWhatIfRange() {
  const be = breakEven();
  const hist = mergedHistory().map((p) => p.spot);
  const lo = Math.min(be, ...hist, state.spot ?? be);
  const hi = Math.max(be, ...hist, state.spot ?? be);
  const slider = $("whatif");
  slider.min = Math.floor((lo * 0.8) / 50) * 50;
  slider.max = Math.ceil((hi * 1.2) / 50) * 50;
  $("whatif-marks").innerHTML =
    `<option value="${Math.round(be)}" label="Break-even"></option>` +
    (state.spot ? `<option value="${Math.round(state.spot)}" label="Today"></option>` : "");
}

function renderAll(opts) {
  renderWhatIfRange();
  renderStage(opts);
  renderBoard();
  renderReceipt();
  renderChart();
}

/* ─── History chart ────────────────────────────────────────────── */

const chart = { el: $("chart"), pts: [], geo: null, active: -1 };

function niceStep(range) {
  const raw = range / 4;
  const steps = [25, 50, 100, 200, 250, 500, 1000];
  return steps.find((s) => s >= raw) || 1000;
}

function renderChart() {
  const wrap = chart.el;
  const w = Math.max(280, wrap.clientWidth);
  const h = w < 560 ? 230 : 290;
  const pad = { l: 54, r: w < 560 ? 12 : 20, t: 18, b: 30 };
  const pts = mergedHistory();
  const be = breakEven();
  const spots = pts.map((p) => p.spot);
  const step = niceStep(Math.max(...spots, be) - Math.min(...spots, be));
  const yMin = Math.floor((Math.min(...spots, be) - step * 0.4) / step) * step;
  const yMax = Math.ceil((Math.max(...spots, be) + step * 0.4) / step) * step;
  const t0 = dayOf(pts[0].date).getTime();
  const t1 = Math.max(t0 + 86400000, dayOf(pts[pts.length - 1].date).getTime());
  const X = (iso) => pad.l + ((dayOf(iso).getTime() - t0) / (t1 - t0)) * (w - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);

  chart.pts = pts.map((p) => ({ ...p, x: X(p.date), y: Y(p.spot) }));
  chart.geo = { w, h, pad, yBE: Y(be) };

  let svg = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" tabindex="0" role="img" aria-label="Price history chart. Use the left and right arrow keys to move through the days.">`;

  // grid + y labels
  for (let v = yMin; v <= yMax; v += step) {
    const y = Y(v).toFixed(1);
    svg += `<line class="grid" x1="${pad.l}" x2="${w - pad.r}" y1="${y}" y2="${y}"/>`;
    svg += `<text class="axis" x="${pad.l - 10}" y="${+y + 4}" text-anchor="end">$${fmtNum.format(v)}</text>`;
  }

  // month labels
  const first = dayOf(pts[0].date);
  const m = new Date(first.getFullYear(), first.getMonth() + 1, 1);
  const end = dayOf(pts[pts.length - 1].date);
  let lastX = -Infinity;
  for (; m <= end; m.setMonth(m.getMonth() + 1)) {
    const iso = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-01`;
    const x = X(iso);
    if (x - lastX < 44) continue;
    lastX = x;
    svg += `<text class="axis" x="${x.toFixed(1)}" y="${h - 8}" text-anchor="middle">${fmtMonth.format(m)}</text>`;
  }

  // zones between the price line and break-even
  const line = chart.pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const yBE = Y(be).toFixed(1);
  const firstX = chart.pts[0].x.toFixed(1);
  const lastPX = chart.pts[chart.pts.length - 1].x.toFixed(1);
  const area = `${line} L${lastPX} ${yBE} L${firstX} ${yBE} Z`;
  svg += `<clipPath id="above"><rect x="0" y="0" width="${w}" height="${yBE}"/></clipPath>`;
  svg += `<clipPath id="below"><rect x="0" y="${yBE}" width="${w}" height="${h}"/></clipPath>`;
  svg += `<path class="zone-up" d="${area}" clip-path="url(#above)"/>`;
  svg += `<path class="zone-down" d="${area}" clip-path="url(#below)"/>`;

  // break-even
  svg += `<line class="be" x1="${pad.l}" x2="${w - pad.r}" y1="${yBE}" y2="${yBE}"/>`;
  svg += `<text class="be-label" x="${w - pad.r}" y="${+yBE - 8}" text-anchor="end">Break-even ${fmtUSD.format(be)}</text>`;

  svg += `<path class="line" d="${line}"/>`;
  for (const p of chart.pts) svg += `<circle class="dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5"/>`;

  // where it started and where it is
  const p0 = chart.pts[0];
  const pN = chart.pts[chart.pts.length - 1];
  svg += `<text class="mark-label" x="${p0.x + 8}" y="${p0.y + (p0.y < chart.geo.yBE + 24 && p0.y > chart.geo.yBE - 24 ? 20 : -10)}">Bought</text>`;
  if (pts.length > 1) svg += `<text class="mark-label" x="${pN.x - 6}" y="${pN.y + (pN.y > h - 50 ? -12 : 22)}" text-anchor="end">${fmtDayShort.format(dayOf(pN.date))}</text>`;

  svg += `<line class="cross" id="cross" x1="0" x2="0" y1="${pad.t}" y2="${h - pad.b}"/>`;
  svg += `<circle class="hot" id="hot" cx="0" cy="0" r="6.5"/>`;
  svg += `</svg>`;

  const tip = $("chart-tip");
  wrap.innerHTML = svg;
  wrap.appendChild(tip);

  renderHistoryStats(pts);
  renderHistoryTable(pts);
  wireChart();
  if (chart.active >= 0 && chart.active < chart.pts.length && state.scrub) showPoint(chart.active, false);
}

function renderHistoryStats(pts) {
  let lo = pts[0], hi = pts[0];
  for (const p of pts) { if (p.spot < lo.spot) lo = p; if (p.spot > hi.spot) hi = p; }
  const dShort = (iso) => fmtDayShort.format(dayOf(iso));
  $("history-stats").innerHTML =
    `<div><dt>Lowest</dt><dd>${fmtUSD.format(lo.spot)} · ${dShort(lo.date)}</dd></div>` +
    `<div><dt>Highest</dt><dd>${fmtUSD.format(hi.spot)} · ${dShort(hi.date)}</dd></div>` +
    `<div><dt>Days recorded</dt><dd>${pts.length}</dd></div>`;
}

function renderHistoryTable(pts) {
  $("history-table").querySelector("tbody").innerHTML = pts
    .map((p) => `<tr><td>${fmtDay.format(dayOf(p.date))}</td><td>${fmtUSD.format(p.spot)}</td><td>${fmtSignedUSD(position(p.spot).pnl)}</td></tr>`)
    .join("");
}

function showPoint(i, updateStage = true) {
  const p = chart.pts[i];
  if (!p) return;
  chart.active = i;
  const svg = chart.el.querySelector("svg");
  const cross = svg.querySelector("#cross");
  const hot = svg.querySelector("#hot");
  cross.setAttribute("x1", p.x); cross.setAttribute("x2", p.x);
  hot.setAttribute("cx", p.x); hot.setAttribute("cy", p.y);
  chart.el.classList.add("is-scrubbing");

  const tip = $("chart-tip");
  const pnl = position(p.spot).pnl;
  tip.innerHTML = `${fmtDay.format(dayOf(p.date))}<br><strong>${fmtUSD.format(p.spot)}/oz</strong> · ${fmtSignedUSD(pnl)}`;
  tip.hidden = false;
  const tw = tip.offsetWidth, th = tip.offsetHeight;
  const left = clamp(p.x - tw / 2, 0, chart.geo.w - tw);
  const top = p.y - th - 14 < 0 ? p.y + 14 : p.y - th - 14;
  tip.style.transform = `translate(${left}px, ${top}px)`;

  if (updateStage) {
    state.scrub = { date: p.date, spot: p.spot };
    renderStage();
  }
}

function clearPoint() {
  chart.active = -1;
  chart.el.classList.remove("is-scrubbing");
  $("chart-tip").hidden = true;
  if (state.scrub) {
    state.scrub = null;
    renderStage();
  }
}

function nearestIndex(x) {
  let best = 0, bd = Infinity;
  chart.pts.forEach((p, i) => { const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = i; } });
  return best;
}

function wireChart() {
  const svg = chart.el.querySelector("svg");
  const localX = (e) => {
    const r = svg.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * chart.geo.w;
  };
  svg.addEventListener("pointermove", (e) => {
    const i = nearestIndex(localX(e));
    if (i !== chart.active || !state.scrub) showPoint(i);
  });
  svg.addEventListener("pointerdown", (e) => showPoint(nearestIndex(localX(e))));
  svg.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") clearPoint(); });
  svg.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") setTimeout(clearPoint, 1600); });
  svg.addEventListener("keydown", (e) => {
    const n = chart.pts.length;
    let i = chart.active < 0 ? n - 1 : chart.active;
    if (e.key === "ArrowLeft") i = Math.max(0, i - 1);
    else if (e.key === "ArrowRight") i = Math.min(n - 1, i + 1);
    else if (e.key === "Home") i = 0;
    else if (e.key === "End") i = n - 1;
    else if (e.key === "Escape") { clearPoint(); return; }
    else return;
    e.preventDefault();
    showPoint(i);
  });
  svg.addEventListener("focus", () => { if (chart.active < 0) showPoint(chart.pts.length - 1); });
  svg.addEventListener("blur", clearPoint);
}

new ResizeObserver(() => {
  const w = chart.el.clientWidth;
  if (chart.geo && Math.abs(chart.geo.w - w) < 2) return;
  renderChart();
}).observe(chart.el);

/* ─── Prices in ────────────────────────────────────────────────── */

function setFeed(kind, text) {
  $("feed").dataset.kind = kind;
  $("price-status").textContent = text;
}

function setSpot(spot, source) {
  state.spot = spot;
  state.source = source;
  state.whatIf = null;
  state.scrub = null;
  renderAll({ settle: true });
  settle($("spot-price"));
}

function setManualMsg(text, kind) {
  const el = $("manual-msg");
  el.textContent = text;
  el.className = "manual-msg" + (kind ? " is-" + kind : "");
}

async function fetchLivePrice({ userAsked = false } = {}) {
  const key = (typeof CONFIG !== "undefined" && CONFIG.GOLD_API_KEY) || "";
  const btn = $("refresh-btn");

  if (!key) {
    setFeed("saved", `No live feed set up · ${state.source.text}`);
    setManualMsg("No live price feed is connected. Type the price you see and it updates everything.");
    if (userAsked) $("manual-price").focus();
    return;
  }

  btn.disabled = true;
  btn.setAttribute("aria-busy", "true");
  btn.querySelector(".btn-label").textContent = "Checking…";
  setFeed("saved", "Checking the live price…");

  try {
    const res = await fetch("https://www.goldapi.io/api/XAU/USD", { headers: { "x-access-token": key } });
    if (!res.ok) throw new Error(`the price service answered ${res.status}`);
    const data = await res.json();
    if (typeof data.price !== "number") throw new Error("no price came back");

    saveJSON(STORE.LAST_SPOT, { spot: data.price, time: Date.now() });
    persistTodayPoint(data.price);
    setSpot(data.price, { kind: "live", text: "Live" });
    setFeed("live", `Live · checked ${fmtTime.format(new Date())}`);
    setManualMsg("");
  } catch (err) {
    setFeed("error", `Couldn't get a live price: ${err.message}`);
    setManualMsg("The live price didn't load. Type the price you see to update the scale.", "error");
    if (userAsked) $("manual-price").focus();
  } finally {
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    btn.querySelector(".btn-label").textContent = "Check price";
  }
}

$("manual-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("manual-price");
  const spot = parseFloat(input.value);
  if (!(spot > 0)) {
    input.setAttribute("aria-invalid", "true");
    setManualMsg("Enter the price per troy ounce in dollars, for example 4150.", "error");
    input.focus();
    return;
  }
  input.removeAttribute("aria-invalid");
  saveJSON(STORE.LAST_SPOT, { spot, time: Date.now() });
  setSpot(spot, { kind: "manual", text: "Your price" });
  setFeed("manual", `Using your price · ${fmtTime.format(new Date())}`);
  setManualMsg(`Updated to ${fmtUSDc.format(spot)}/oz. Typed prices aren't added to the history.`, "ok");
  input.value = "";
});
$("manual-price").addEventListener("input", (e) => e.target.removeAttribute("aria-invalid"));

$("refresh-btn").addEventListener("click", () => fetchLivePrice({ userAsked: true }));

/* ─── Your gold ────────────────────────────────────────────────── */

$("khr-rate").addEventListener("input", () => {
  saveJSON(STORE.KHR_RATE, khrRate());
  renderStage();
  renderReceipt();
});

$("purchase-price").addEventListener("input", () => {
  saveJSON(STORE.PURCHASE_USD, purchaseUsd());
  renderAll();
});

/* ─── What if ──────────────────────────────────────────────────── */

$("whatif").addEventListener("input", (e) => {
  state.scrub = null;
  state.whatIf = parseFloat(e.target.value);
  renderStage();
});

$("whatif-reset").addEventListener("click", () => {
  state.whatIf = null;
  renderStage();
  $("whatif").focus();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.whatIf !== null && !e.defaultPrevented) {
    state.whatIf = null;
    renderStage();
  }
});

/* ─── Theme ────────────────────────────────────────────────────── */

function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
function syncThemeButton() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  $("theme-btn").setAttribute("aria-label", `Switch to ${next} theme`);
  document.querySelector('meta[name="theme-color"]').content = currentTheme() === "dark" ? "#1c1210" : "#f2e6cd";
}
$("theme-btn").addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(STORE.THEME, next); } catch {}
  syncThemeButton();
});

/* ─── Start ────────────────────────────────────────────────────── */

(function init() {
  const savedRate = loadJSON(STORE.KHR_RATE, null);
  const savedPurchase = loadJSON(STORE.PURCHASE_USD, null);
  if (savedRate) $("khr-rate").value = savedRate;
  if (savedPurchase) $("purchase-price").value = savedPurchase;

  drawDial();
  drawScale();
  syncThemeButton();

  // Start from the newest price we know: the last check, or the last history point.
  const history = mergedHistory();
  const latest = history[history.length - 1];
  const latestTime = dayOf(latest.date).getTime() + 86399000;
  if (previousCheck && previousCheck.spot > 0 && previousCheck.time > latestTime) {
    state.spot = previousCheck.spot;
    state.source = { kind: "saved", text: `Last checked ${fmtDayShort.format(new Date(previousCheck.time))}` };
  } else {
    state.spot = latest.spot;
    state.source = { kind: "saved", text: `Last saved ${fmtDay.format(dayOf(latest.date))}` };
  }
  setFeed("saved", state.source.text);

  // the beam starts level and settles under the weight: the one signature moment
  renderAll();
  fetchLivePrice();
})();
