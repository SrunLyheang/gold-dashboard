"use strict";

const OUNCES = 1.2055;
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

const STORE = {
  HISTORY: "goldDashboard.history",
  KHR_RATE: "goldDashboard.khrRate",
  LAST_SPOT: "goldDashboard.lastSpot",
  PURCHASE_USD: "goldDashboard.purchaseUsd",
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

const fmtUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const fmtUSDcents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtNum = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const $ = (id) => document.getElementById(id);

function fmtKHR(value) {
  return fmtNum.format(Math.round(value)) + " ៛";
}

function fmtSignedUSD(value) {
  const sign = value >= 0 ? "+" : "−";
  return sign + fmtUSD.format(Math.abs(value));
}

function fmtSignedKHR(value) {
  const sign = value >= 0 ? "+" : "−";
  return sign + fmtKHR(Math.abs(value));
}

function khrRate() {
  const value = parseFloat($("khr-rate").value);
  return value > 0 ? value : DEFAULT_KHR_RATE;
}

function purchaseUsd() {
  const value = parseFloat($("purchase-price").value);
  return value > 0 ? value : DEFAULT_PURCHASE_USD;
}

function breakEvenSpot() {
  return purchaseUsd() / OUNCES;
}

let currentSpot = null;
let chart = null;
const previousCheck = loadJSON(STORE.LAST_SPOT, null);

function updateDashboard(spot) {
  currentSpot = spot;

  const rate = khrRate();
  const purchase = purchaseUsd();
  const breakEven = breakEvenSpot();
  const currentValue = spot * OUNCES;
  const pnlUSD = currentValue - purchase;
  const pnlPct = (pnlUSD / purchase) * 100;
  const pnlKHR = pnlUSD * rate;
  const inProfit = pnlUSD >= 0;

  $("spot-price").textContent = fmtUSDcents.format(spot);
  $("spot-purchase").textContent = fmtUSD.format(PURCHASE_SPOT);
  $("spot-now").textContent = fmtUSD.format(spot);
  $("purchase-usd-cell").textContent = fmtUSD.format(purchase);
  $("value-usd").textContent = fmtUSD.format(currentValue);
  $("purchase-khr").textContent = fmtKHR(purchase * rate);
  $("value-khr").textContent = fmtKHR(currentValue * rate);
  $("purchase-summary").textContent =
    `1 តម្លឹង (37.5 g / 1.2055 oz) · purchase price ${fmtUSD.format(purchase)}`;

  const pnlSlots = [
    [$("pnl-usd"), fmtSignedUSD(pnlUSD)],
    [$("pnl-khr"), fmtSignedKHR(pnlKHR)],
    [$("pnl-pct"), (pnlPct >= 0 ? "+" : "−") + Math.abs(pnlPct).toFixed(2) + "%"],
  ];

  for (const [el, text] of pnlSlots) {
    el.textContent = text;
    el.classList.remove("profit", "loss");
    el.classList.add(inProfit ? "profit" : "loss");
  }

  if (previousCheck && previousCheck.spot) {
    const diff = spot - previousCheck.spot;
    const when = new Date(previousCheck.time).toLocaleDateString();
    $("change-since").textContent =
      `Change vs last check (${when}): ${fmtSignedUSD(diff)}/oz`;
  } else {
    $("change-since").textContent = "Change vs last check: — (first check)";
  }

  const gap = breakEven - spot;
  const gapPct = (gap / spot) * 100;

  $("break-even-gap").textContent = gap > 0
    ? `Gap to break-even ($${fmtNum.format(breakEven)}/oz): ` +
      `${fmtUSD.format(gap)}/oz to go (+${gapPct.toFixed(2)}% move needed)`
    : `Above break-even ($${fmtNum.format(breakEven)}/oz) by ${fmtUSD.format(-gap)}/oz`;

  $("chart-note").textContent =
    `Dashed line = break-even (${fmtUSD.format(breakEven)}/oz). ` +
    "Live prices fetched by the dashboard are saved and appear here over time.";

  saveJSON(STORE.LAST_SPOT, { spot, time: Date.now() });
}

function mergedHistory() {
  const saved = loadJSON(STORE.HISTORY, []);
  const byDate = new Map();

  for (const point of SEED_HISTORY) byDate.set(point.date, point.spot);
  for (const point of saved) byDate.set(point.date, point.spot);

  return [...byDate.entries()]
    .map(([date, spot]) => ({ date, spot }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function persistTodayPoint(spot) {
  const today = new Date().toISOString().slice(0, 10);
  const saved = loadJSON(STORE.HISTORY, []).filter((point) => point.date !== today);
  saved.push({ date: today, spot });
  saveJSON(STORE.HISTORY, saved);
}

function chartData() {
  const points = mergedHistory();
  const labels = points.map((point) => point.date);
  const spots = points.map((point) => point.spot);
  const css = getComputedStyle(document.documentElement);
  const gold = css.getPropertyValue("--gold").trim();
  const muted = css.getPropertyValue("--ink-muted").trim();
  const breakEven = breakEvenSpot();

  return {
    labels,
    datasets: [
      {
        label: "Spot USD/oz",
        data: spots,
        borderColor: gold,
        backgroundColor: gold,
        borderWidth: 2,
        pointRadius: 2.5,
        pointHoverRadius: 5,
        tension: 0.25,
      },
      {
        label: `Break-even ${fmtUSD.format(breakEven)}`,
        data: labels.map(() => breakEven),
        borderColor: muted,
        borderWidth: 1.5,
        borderDash: [6, 5],
        pointRadius: 0,
        pointHitRadius: 0,
      },
    ],
  };
}

function renderChart() {
  const data = chartData();
  const muted = getComputedStyle(document.documentElement)
    .getPropertyValue("--ink-muted")
    .trim();

  if (chart) {
    chart.data = data;
    chart.update();
    return;
  }

  chart = new Chart($("history-chart"), {
    type: "line",
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "nearest", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const spot = ctx.parsed.y;
              const pnl = spot * OUNCES - purchaseUsd();
              return ` ${fmtUSD.format(spot)}/oz  (P&L ${fmtSignedUSD(pnl)})`;
            },
          },
        },
      },
      scales: {
        x: {
          ticks: { color: muted, maxTicksLimit: 6, maxRotation: 0 },
          grid: { display: false },
        },
        y: {
          ticks: { color: muted, callback: (value) => "$" + fmtNum.format(value) },
          grid: { color: "rgba(176, 154, 122, 0.14)" },
        },
      },
    },
  });
}

function setStatus(text, mood) {
  const el = $("price-status");
  el.textContent = text;
  el.classList.remove("live", "error");
  if (mood) el.classList.add(mood);
}

function showManualFallback() {
  $("manual-row").hidden = false;
}

async function fetchLivePrice() {
  const key = (typeof CONFIG !== "undefined" && CONFIG.GOLD_API_KEY) || "";

  if (!key) {
    setStatus("No API key (config.js) — enter the price manually below.", "error");
    showManualFallback();
    return;
  }

  setStatus("Fetching live price…");

  try {
    const res = await fetch("https://www.goldapi.io/api/XAU/USD", {
      headers: { "x-access-token": key },
    });

    if (!res.ok) throw new Error(`API responded ${res.status}`);

    const data = await res.json();
    if (typeof data.price !== "number") throw new Error("No price in response");

    updateDashboard(data.price);
    persistTodayPoint(data.price);
    renderChart();
    setStatus("Live · updated " + new Date().toLocaleTimeString(), "live");
  } catch (err) {
    setStatus(`Couldn't fetch (${err.message}) — enter the price manually.`, "error");
    showManualFallback();
  }
}

function applyManualPrice() {
  const spot = parseFloat($("manual-price").value);
  if (!(spot > 0)) return;
  updateDashboard(spot);
  setStatus("Manual price (not saved to history)", undefined);
}

$("manual-apply").addEventListener("click", applyManualPrice);
$("manual-price").addEventListener("keydown", (event) => {
  if (event.key === "Enter") applyManualPrice();
});

$("refresh-btn").addEventListener("click", fetchLivePrice);

$("khr-rate").addEventListener("input", () => {
  saveJSON(STORE.KHR_RATE, khrRate());
  if (currentSpot !== null) updateDashboard(currentSpot);
});

$("purchase-price").addEventListener("input", () => {
  saveJSON(STORE.PURCHASE_USD, purchaseUsd());
  if (currentSpot !== null) updateDashboard(currentSpot);
  renderChart();
});

(function init() {
  const savedRate = loadJSON(STORE.KHR_RATE, null);
  const savedPurchase = loadJSON(STORE.PURCHASE_USD, null);

  if (savedRate) $("khr-rate").value = savedRate;
  if (savedPurchase) $("purchase-price").value = savedPurchase;

  renderChart();
  const history = mergedHistory();
  const latest = history[history.length - 1];
  updateDashboard(latest.spot);
  setStatus(`Showing last known price (${latest.date})`);
  fetchLivePrice();
})();
