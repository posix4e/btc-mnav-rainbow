let chart = null;
let btcData = [];
let mnavData = [];

const referenceRainbowHex = [
  '#4472c4', '#54989f', '#63be7b', '#b1d580', '#feeb84',
  '#f6b45a', '#ed7d31', '#d64018', '#c00200',
];

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
const rainbowColors = referenceRainbowHex.map((hex) => hexToRgba(hex, 0.18));

const halvingDates = [
  { date: '2012-11-28', label: '1st Halving' },
  { date: '2016-07-09', label: '2nd Halving' },
  { date: '2020-05-11', label: '3rd Halving' },
  { date: '2024-04-20', label: '4th Halving' },
  { date: '2028-04-01', label: '5th Halving (Est.)' },
];

const BTC_COLOR = '#ff8c00';
const MNAV_COLOR = '#9050ff';

// Live data: try dailysatprice at view time, fall back to baked data.js (no republish needed).
const LIVE_BTC_CSV = 'https://dailysatprice.com/data/latest.csv';
const LIVE_BTC_WEEKLY_JSON = 'https://dailysatprice.com/data/weekly.json'; // ~30x smaller, pre-bucketed Mondays (added in fetch_btc_data.py patch)
// Optional: if you publish https://dailysatprice.com/data/strategy.json, wire it here:
// const LIVE_STRATEGY_JSON = 'https://dailysatprice.com/data/strategy.json';

function getISOWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc - yearStart) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
function getMondayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() - dayNum + 1);
  return utc.toISOString().split('T')[0];
}
function toMondayWeekly(rows) {
  const m = new Map();
  for (const r of rows) m.set(getISOWeek(r.date), { ...r, date: getMondayOfWeek(r.date) });
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}
function parseBtcCsv(text) {
  const lines = text.trim().split('\n');
  if (!lines.length) return [];
  const header = lines[0].toLowerCase();
  const hasHash = header.includes('# date');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const [a, b] = line.split(',');
    const date = hasHash ? a.replace(/^"#?\s*/, '').replace(/"$/, '').replace('# ', '').trim() : a.trim().replace(/^"|"$/g, '');
    const price = parseFloat(b);
    if (date && price > 0) rows.push({ date, price });
  }
  return toMondayWeekly(rows);
}
function linRegressXY(X, Y) {
  const n = Math.min(X.length, Y.length);
  if (!n) return { slope: 0, intercept: 0 };
  let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
  for (let i = 0; i < n; i++) { sumX += X[i]; sumY += Y[i]; sumXX += X[i] * X[i]; sumXY += X[i] * Y[i]; }
  const denom = (n * sumXX - sumX * sumX) || 1e-12;
  const slope = (n * sumXY - sumX * sumY) / denom;
  return { slope, intercept: (sumY - slope * sumX) / n };
}
function fitRainbowModelLive(series) {
  const clean = series.filter((d) => d && isFinite(d.price) && d.price > 0);
  const n = clean.length;
  if (n < 10) return null;
  const x = clean.map((_, i) => i + 1);
  const y = clean.map((d) => Math.log(d.price));
  const bMax = Math.max(2000, Math.min(10000, n * 2));
  let best = { b: 0, a: 0, c: 0, sse: Infinity };
  function evalB(b) {
    const X = x.map((v) => Math.log(b + v));
    const { slope: a, intercept: c } = linRegressXY(X, y);
    let sse = 0; for (let i = 0; i < n; i++) { const e = y[i] - (a * X[i] + c); sse += e * e; }
    return { a, b, c, sse };
  }
  let step = (bMax - 0) / 100;
  for (let b = 0; b <= bMax; b += step) { const r = evalB(b); if (r.sse < best.sse) best = r; }
  for (let round = 0; round < 3; round++) {
    const span = step * 2, left = Math.max(0, best.b - span), right = Math.min(bMax, best.b + span);
    step = (right - left) / 50;
    for (let b = left; b <= right; b += step) { const r = evalB(b); if (r.sse < best.sse) best = r; }
  }
  return { a: best.a, b: best.b, c: best.c, bandWidth: 0.3, numBands: 9, iDecrease: 1.5 };
}

async function loadData() {
  let bakedBtc = typeof btcHistoricalData !== 'undefined' ? btcHistoricalData : [];
  let bakedMnav = typeof mnavHistoricalData !== 'undefined' ? mnavHistoricalData : [];
  let bakedModel = typeof rainbowModelBTC !== 'undefined' ? rainbowModelBTC : null;

  // Try live BTC — weekly.json first (small, pre-bucketed), then full CSV.
  let liveWeekly = null;
  try {
    const r = await fetch(LIVE_BTC_WEEKLY_JSON, { cache: 'no-store' });
    if (r.ok) {
      const arr = await r.json();
      if (Array.isArray(arr) && arr.length > 10 && arr[0].date && arr[0].price) {
        // already Monday-weekly
        liveWeekly = arr.map((o) => ({ date: String(o.date).slice(0,10), price: Number(o.price) })).filter((o) => o.price > 0);
        console.log(`[live] weekly.json: ${liveWeekly.length} weeks`);
      }
    }
  } catch (e) {
    console.log('[live] weekly.json fetch failed', e?.message || e);
  }
  if (!liveWeekly) {
    try {
      const res = await fetch(LIVE_BTC_CSV, { cache: 'no-store' });
      if (res.ok) liveWeekly = parseBtcCsv(await res.text());
    } catch (e) {
      console.log('[live] CSV fetch failed', e?.message || e);
    }
  }
  if (liveWeekly && liveWeekly.length > 10) {
    const liveLast = liveWeekly[liveWeekly.length - 1]?.date;
    const bakedLast = bakedBtc[bakedBtc.length - 1]?.date;
    if (!bakedLast || liveLast > bakedLast || liveWeekly.length !== bakedBtc.length) {
      bakedBtc = liveWeekly;
      const liveModel = fitRainbowModelLive(bakedBtc);
      if (liveModel) bakedModel = liveModel;
      console.log(`[live] BTC updated from dailysatprice: ${liveWeekly.length} weekly, last ${liveLast}`);
    } else {
      console.log(`[live] BTC fresh but not newer (${liveLast} vs ${bakedLast}) — using baked`);
    }
  } else if (liveWeekly) {
    console.log('[live] weekly data too short, using baked');
  } else {
    console.log('[live] no live BTC, using baked data.js');
  }

  btcData = bakedBtc;
  mnavData = bakedMnav;
  // stash model for createChart (overrides baked global)
  window.__liveRainbowModelBTC = bakedModel;
  createChart();
  updateStats();
}

function computeModelSeries(length, model) {
  if (!model) return Array(length).fill(null);
  const { a, b, c } = model;
  const out = new Array(length);
  for (let i = 0; i < length; i++) {
    const x = i + 1;
    out[i] = Math.exp(a * Math.log(b + x) + c);
  }
  return out;
}

function createChart() {
  const ctx = document.getElementById('rainbowChart').getContext('2d');
  if (chart) chart.destroy();

  const dates = btcData.map((d) => d.date);
  const model = window.__liveRainbowModelBTC || (typeof rainbowModelBTC !== 'undefined' ? rainbowModelBTC : null);
  const baseline = computeModelSeries(dates.length, model);

  // Build rainbow bands in log space: 9 bands around baseline
  const bands = [];
  if (model && baseline.length) {
    const numBands = model.numBands || 9;
    const bandWidth = model.bandWidth || 0.3;
    const iDecrease = model.iDecrease ?? 1.5;
    const lower0 = baseline.map((v) => Math.exp(Math.log(v) + (0 - iDecrease) * bandWidth - bandWidth));
    bands.push({
      label: '',
      data: lower0,
      borderColor: 'transparent',
      backgroundColor: 'transparent',
      fill: false,
      pointRadius: 0,
      tension: 0,
      order: 10,
    });
    for (let i = 0; i < numBands; i++) {
      const upper = baseline.map((v) => Math.exp(Math.log(v) + (i - iDecrease) * bandWidth));
      bands.push({
        label: '',
        data: upper,
        borderColor: 'transparent',
        backgroundColor: rainbowColors[Math.min(i, rainbowColors.length - 1)],
        fill: '-1',
        pointRadius: 0,
        tension: 0,
        order: 10 + 1 + i,
      });
    }
  }

  const btcSpotData = dates.map((date) => {
    const item = btcData.find((d) => d.date === date);
    return item ? item.price : null;
  });

  const mnavAligned = dates.map((date) => {
    const item = mnavData.find((m) => m.date === date);
    if (!item) return null;
    // Prefer advanced (EV) adjusted price, fall back to naive
    return item.advancedMnavAdjustedPrice ?? item.naiveMnavAdjustedPrice ?? null;
  });

  const halvingAnnotations = {};
  halvingDates.forEach((h, i) => {
    halvingAnnotations[`halving${i}`] = {
      type: 'line',
      scaleID: 'x',
      value: h.date,
      borderColor: 'rgba(255,255,255,0.9)',
      borderWidth: 1,
      label: {
        content: h.label,
        enabled: true,
        position: 'start',
        backgroundColor: 'rgba(0,0,0,0.75)',
        color: 'white',
        font: { size: 10 },
        rotation: 270,
        yAdjust: -50,
      },
    };
  });

  const datasets = [
    {
      label: 'BTC Spot',
      data: btcSpotData,
      borderColor: BTC_COLOR,
      backgroundColor: 'transparent',
      borderWidth: 2.2,
      pointRadius: 0,
      tension: 0.15,
      order: 1,
      spanGaps: true,
    },
    {
      label: 'MSTR MNAV',
      data: mnavAligned,
      borderColor: MNAV_COLOR,
      backgroundColor: 'transparent',
      borderWidth: 2,
      borderDash: [0, 0],
      pointRadius: 0,
      tension: 0.15,
      order: 2,
      spanGaps: true,
    },
    ...bands,
  ];

  chart = new Chart(ctx, {
    type: 'line',
    data: { labels: dates, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        annotation: { annotations: halvingAnnotations },
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              if (ctx.dataset.label === '') return null;
              const v = ctx.parsed.y;
              if (v == null) return null;
              return `${ctx.dataset.label}: $${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: { parser: 'yyyy-MM-dd', displayFormats: { year: 'yyyy' } },
          title: { display: true, text: 'Date' },
        },
        y: {
          type: 'logarithmic',
          title: { display: true, text: 'Price (USD) — log scale' },
          ticks: {
            callback(value) { return '$' + Number(value).toLocaleString('en-US'); },
          },
        },
      },
    },
  });

  setupToggles();
}

function setupToggles() {
  const spotEl = document.getElementById('showSpot');
  const mnavEl = document.getElementById('showMNAV');

  if (spotEl) {
    spotEl.addEventListener('change', (e) => {
      const ds = chart.data.datasets.find((d) => d.label === 'BTC Spot');
      if (ds) ds.hidden = !e.target.checked;
      chart.update();
    });
  }
  if (mnavEl) {
    mnavEl.addEventListener('change', (e) => {
      const ds = chart.data.datasets.find((d) => d.label === 'MSTR MNAV');
      if (ds) ds.hidden = !e.target.checked;
      chart.update();
    });
  }

  document.querySelectorAll('.zoom-btn').forEach((btn) => {
    btn.addEventListener('click', function () {
      if (!chart) return;
      document.querySelectorAll('.zoom-btn').forEach((b) => b.classList.remove('active'));
      this.classList.add('active');

      const range = this.dataset.range;
      const today = new Date();
      let minDate = null;
      let maxDate = null;

      const daysPerHalving = 1460;
      switch (range) {
        case '1.5H':
          minDate = new Date(today); minDate.setDate(minDate.getDate() - 1.5 * daysPerHalving);
          maxDate = today; break;
        case '2.5H':
          minDate = new Date(today); minDate.setDate(minDate.getDate() - 2.5 * daysPerHalving);
          maxDate = today; break;
        case '3.5H':
          minDate = new Date(today); minDate.setDate(minDate.getDate() - 3.5 * daysPerHalving);
          maxDate = today; break;
        default:
          minDate = null; maxDate = null;
      }
      chart.options.scales.x.min = minDate ? minDate.toISOString().split('T')[0] : undefined;
      chart.options.scales.x.max = maxDate ? maxDate.toISOString().split('T')[0] : undefined;
      chart.update('none');
    });
  });
}

function updateStats() {
  if (!btcData.length || !mnavData.length) return;
  const latestBTC = btcData[btcData.length - 1];
  const latestMNAV = mnavData[mnavData.length - 1];
  const mnavPct = latestMNAV.advancedMnav != null
    ? (latestMNAV.advancedMnav * 100).toFixed(1) + '%'
    : (latestMNAV.naiveMnav != null ? (latestMNAV.naiveMnav * 100).toFixed(1) + '%' : '—');
  const premium = latestBTC.price ? (((latestMNAV.advancedMnavAdjustedPrice ?? latestMNAV.naiveMnavAdjustedPrice ?? 0) / latestBTC.price - 1) * 100).toFixed(1) + '%' : '—';

  document.getElementById('stats').innerHTML = `
    <div class="stat-card"><h3>BTC Spot</h3><p>$${latestBTC.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p><small>${latestBTC.date}</small></div>
    <div class="stat-card"><h3>MNAV (EV / BTC NAV)</h3><p>${mnavPct}</p><small>MSTR enterprise value</small></div>
    <div class="stat-card"><h3>MNAV-Adjusted Price</h3><p>$${(latestMNAV.advancedMnavAdjustedPrice ?? latestMNAV.naiveMnavAdjustedPrice ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}</p><small>${premium} vs spot</small></div>
    <div class="stat-card"><h3>MSTR BTC Holdings</h3><p>${(latestMNAV.btcHoldings ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })} BTC</p><small>${latestMNAV.date}</small></div>
  `;
}

document.addEventListener('DOMContentLoaded', loadData);
