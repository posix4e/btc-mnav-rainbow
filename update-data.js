#!/usr/bin/env node
/** Generate data.js from CSVs. Run: npm run update-data */
const fs = require('fs');
const { parse } = require('csv-parse/sync');

const BTC_CSV_PATH = 'dailysatprice_latest.csv';
const MNAV_CSV_PATH = 'MSTR.csv';
const OUTPUT_JS_PATH = 'data.js';
const STR_FILES = { STRC: 'STRC.csv', STRD: 'STRD.csv', STRF: 'STRF.csv', STRK: 'STRK.csv' };

// ---- date helpers ----
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
function toNum(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : null; }

// ---- readers ----
function readBtcData(filepath) {
  if (!fs.existsSync(filepath)) { console.log(`❌ Missing ${filepath}`); return []; }
  const records = parse(fs.readFileSync(filepath, 'utf-8'), { columns: true, skip_empty_lines: true });
  const rows = [];
  for (const row of records) {
    const date = (row['# date'] || row['date'] || '').replace('# ', '');
    const price = parseFloat(row['btc_price_usd'] || row['price'] || 0);
    if (date && price > 0) rows.push({ date, price });
  }
  const weekly = toMondayWeekly(rows);
  console.log(`✅ BTC: ${rows.length} → ${weekly.length} weekly`);
  return weekly;
}

function readStrData(filepath, name) {
  if (!fs.existsSync(filepath)) { console.log(`⚠️  ${name} missing: ${filepath}`); return []; }
  const records = parse(fs.readFileSync(filepath, 'utf-8'), { columns: true, skip_empty_lines: true });
  const rows = [];
  for (const row of records) {
    const date = (row['timestamp'] || '').split(' ')[0];
    if (!date) continue;
    rows.push({ date, notional: toNum(row['notional']) || 0, marketCap: toNum(row['market_cap']) || 0, price: toNum(row['close']) || 0 });
  }
  const weekly = toMondayWeekly(rows);
  console.log(`✅ ${name}: ${rows.length} → ${weekly.length} weekly`);
  return weekly;
}

function readMnavData(filepath) {
  if (!fs.existsSync(filepath)) { console.log(`❌ Missing ${filepath}`); return []; }
  const records = parse(fs.readFileSync(filepath, 'utf-8'), { columns: true, skip_empty_lines: true });
  const rows = [];
  for (const row of records) {
    const date = (row['timestamp'] || '').split(' ')[0];
    if (!date) continue;
    const spotPrice = toNum(row['btc_price']);
    const btcHoldings = toNum(row['btc_holdings']);
    const marketCap = toNum(row['market_cap']);
    const debt = toNum(row['debt']) || 0;
    const pref = toNum(row['pref']) || 0;
    const btcNav = btcHoldings && spotPrice ? btcHoldings * spotPrice : null;
    let naiveMnav = null, advancedMnav = null, naiveAdj = null, advancedAdj = null;
    if (marketCap > 0 && btcNav > 0 && spotPrice > 0) {
      naiveMnav = marketCap / btcNav;
      naiveAdj = naiveMnav * spotPrice;
      advancedMnav = (marketCap + debt + pref) / btcNav;
      advancedAdj = advancedMnav * spotPrice;
    }
    rows.push({ date, spotPrice, naiveMnav, advancedMnav, naiveMnavAdjustedPrice: naiveAdj, advancedMnavAdjustedPrice: advancedAdj, btcHoldings, marketCap, debt, pref, mstrSharePrice: toNum(row['close']), btcNav });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const weekly = toMondayWeekly(rows);
  console.log(`✅ MNAV: ${rows.length} → ${weekly.length} weekly`);
  return weekly;
}

// ---- model fit ----
function linRegressXY(X, Y) {
  const n = Math.min(X.length, Y.length);
  if (!n) return { slope: 0, intercept: 0 };
  let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
  for (let i = 0; i < n; i++) { sumX += X[i]; sumY += Y[i]; sumXX += X[i] * X[i]; sumXY += X[i] * Y[i]; }
  const denom = (n * sumXX - sumX * sumX) || 1e-12;
  const slope = (n * sumXY - sumX * sumY) / denom;
  return { slope, intercept: (sumY - slope * sumX) / n };
}
function fitRainbowModel(series) {
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

function writeDataJs(btcData, mnavData, strDataMap, filepath) {
  const ts = new Date().toISOString();
  const rainbowModelBTC = fitRainbowModel(btcData);
  const mnavSeries = mnavData.filter((d) => isFinite(d.advancedMnavAdjustedPrice) && d.advancedMnavAdjustedPrice > 0).map((d) => ({ date: d.date, price: d.advancedMnavAdjustedPrice }));
  const rainbowModelMNAV = fitRainbowModel(mnavSeries);
  const js = `// Last updated: ${ts}\n// Generated by update-data.js\nconst btcHistoricalData = ${JSON.stringify(btcData, null, 2)};\n\nconst mnavHistoricalData = ${JSON.stringify(mnavData, null, 2)};\n\nconst strHistoricalData = ${JSON.stringify(strDataMap, null, 2)};\n\nconst rainbowModelBTC = ${JSON.stringify(rainbowModelBTC, null, 2)};\nconst rainbowModelMNAV = ${JSON.stringify(rainbowModelMNAV, null, 2)};\n`;
  fs.writeFileSync(filepath, js);
  console.log(`✅ Written ${filepath} — ${btcData.length} BTC, ${mnavData.length} MNAV`);
  if (rainbowModelBTC) console.log(`📐 BTC model a=${rainbowModelBTC.a.toFixed(4)} b=${rainbowModelBTC.b.toFixed(2)} c=${rainbowModelBTC.c.toFixed(4)}`);
  return true;
}

async function main() {
  console.log('🚀 Starting data update…');
  const btcData = readBtcData(BTC_CSV_PATH);
  const mnavData = readMnavData(MNAV_CSV_PATH);
  const strDataMap = {};
  for (const [k, f] of Object.entries(STR_FILES)) strDataMap[k] = readStrData(f, k);
  if (!btcData.length && !mnavData.length) { console.log('❌ No data'); process.exit(1); }
  writeDataJs(btcData, mnavData, strDataMap, OUTPUT_JS_PATH);
  console.log('✨ Done');
}
main().catch((e) => { console.error(e); process.exit(1); });
