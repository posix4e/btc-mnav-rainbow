#!/usr/bin/env node

/**
 * Script to update Bitcoin and MSTR MNAV data and generate data.js
 * Run: npm run update-data
 */

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const https = require('https');
const http = require('http');

// Configuration
const BTC_CSV_PATH = 'dailysatprice_latest.csv';
const MNAV_CSV_PATH = 'MSTR.csv';
const OUTPUT_JS_PATH = 'data.js';
const STR_FILES = {
    STRC: 'STRC.csv',
    STRD: 'STRD.csv',
    STRF: 'STRF.csv',
    STRK: 'STRK.csv'
};

// Optional: URLs to download CSV files from
// const BTC_CSV_URL = 'https://example.com/btc_historical_prices.csv';
// const MNAV_CSV_URL = 'https://example.com/MSTR.csv';

/**
 * Get ISO week number and year from date string (YYYY-MM-DD)
 * Returns a string like "2025-W43"
 */
function getISOWeek(dateStr) {
    const date = new Date(dateStr + 'T00:00:00Z');
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Get Monday of the ISO week for a given date string (YYYY-MM-DD)
 * Returns a date string in YYYY-MM-DD format representing Monday of that week
 */
function getMondayOfWeek(dateStr) {
    const date = new Date(dateStr + 'T00:00:00Z');
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7; // Make Sunday = 7
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - dayNum + 1); // Go back to Monday
    return monday.toISOString().split('T')[0];
}

/**
 * Download file from URL
 */
function downloadFile(url, filepath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(filepath);

        console.log(`Downloading ${url} to ${filepath}...`);

        protocol.get(url, (response) => {
            response.pipe(file);

            file.on('finish', () => {
                file.close();
                console.log(`✅ Downloaded ${filepath}`);
                resolve(true);
            });
        }).on('error', (err) => {
            fs.unlink(filepath, () => {}); // Delete the file on error
            console.log(`❌ Error downloading ${filepath}: ${err.message}`);
            reject(err);
        });
    });
}

/**
 * Read BTC historical data from CSV
 */
function readBtcData(filepath) {
    try {
        if (!fs.existsSync(filepath)) {
            console.log(`❌ File not found: ${filepath}`);
            return [];
        }

        const fileContent = fs.readFileSync(filepath, 'utf-8');
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true
        });

        const allBtcData = [];
        for (const row of records) {
            // Handle potential # prefix in column names
            const date = (row['# date'] || row['date'] || '').replace('# ', '');
            const price = parseFloat(row['btc_price_usd'] || row['price'] || 0);

            if (date && price > 0) {
                allBtcData.push({
                    date: date,
                    price: price
                });
            }
        }

        // Filter to only keep weekly data points (last day of each week with data)
        // Normalize all dates to Monday of that week for consistent matching
        const weeklyData = new Map();
        for (const entry of allBtcData) {
            const isoWeek = getISOWeek(entry.date); // YYYY-Www format
            const normalizedDate = getMondayOfWeek(entry.date);
            weeklyData.set(isoWeek, { date: normalizedDate, price: entry.price }); // Normalize to Monday
        }

        // Convert map to array and sort by date
        const btcData = Array.from(weeklyData.values()).sort((a, b) =>
            a.date.localeCompare(b.date)
        );

        console.log(`✅ Read ${allBtcData.length} total BTC records, filtered to ${btcData.length} weekly data points`);
        return btcData;
    } catch (error) {
        console.log(`❌ Error reading BTC data: ${error.message}`);
        return [];
    }
}

/**
 * Read STR preferred stock data
 */
function readStrData(filepath, strName) {
    try {
        if (!fs.existsSync(filepath)) {
            console.log(`⚠️  ${strName} file not found: ${filepath}`);
            return [];
        }

        const fileContent = fs.readFileSync(filepath, 'utf-8');
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true
        });

        const allStrData = [];
        for (const row of records) {
            const timestamp = row['timestamp'] || '';
            const date = timestamp.split(' ')[0];
            if (!date) continue;

            const toNum = (v) => {
                const n = parseFloat(v);
                return Number.isFinite(n) ? n : null;
            };

            allStrData.push({
                date,
                notional: toNum(row['notional']) || 0,
                marketCap: toNum(row['market_cap']) || 0,
                price: toNum(row['close']) || 0
            });
        }

        // Filter to only keep weekly data points (last day of each week with data)
        // Normalize all dates to Monday of that week for consistent matching
        const weeklyData = new Map();
        for (const entry of allStrData) {
            const isoWeek = getISOWeek(entry.date); // YYYY-Www format
            const normalizedDate = getMondayOfWeek(entry.date);
            weeklyData.set(isoWeek, {
                date: normalizedDate,
                notional: entry.notional,
                marketCap: entry.marketCap,
                price: entry.price
            });
        }

        // Convert map to array and sort by date
        const strData = Array.from(weeklyData.values()).sort((a, b) =>
            a.date.localeCompare(b.date)
        );

        console.log(`✅ Read ${allStrData.length} total ${strName} records, filtered to ${strData.length} weekly data points`);
        return strData;
    } catch (error) {
        console.log(`❌ Error reading ${strName} data: ${error.message}`);
        return [];
    }
}

/**
 * Read MNAV data from CSV
 * Supports new MSTR.csv format from MicroStrategy with columns:
 * - timestamp: date field
 * - btc_price: BTC spot price
 * - btc_holdings: BTC holdings
 * - market_cap: Market cap (enterprise value)
 * - m_nav: MNAV ratio (market_cap / btc_nav)
 * - debt: Total debt
 * - pref: Preferred stock value
 * - close: MSTR share price (closing)
 *
 * True MNAV = (Market Cap + Debt + Preferred) / BTC NAV
 */
function readMnavData(filepath) {
    try {
        if (!fs.existsSync(filepath)) {
            console.log(`❌ File not found: ${filepath}`);
            return [];
        }

        const fileContent = fs.readFileSync(filepath, 'utf-8');
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true
        });

        const mnavData = [];
        for (const row of records) {
            // Parse date from timestamp column
            const timestamp = row['timestamp'] || '';
            const date = timestamp.split(' ')[0]; // Extract date part (YYYY-MM-DD)
            if (!date) continue;

            const toNum = (v) => {
                const n = parseFloat(v);
                return Number.isFinite(n) ? n : null;
            };

            // Map new MSTR.csv columns
            const spotPrice = toNum(row['btc_price']);
            const btcHoldings = toNum(row['btc_holdings']);
            const marketCap = toNum(row['market_cap']);
            const debt = toNum(row['debt']) || 0;
            const pref = toNum(row['pref']) || 0;
            const mstrSharePrice = toNum(row['close']);

            // Calculate both naive and advanced MNAV
            let naiveMnav = null;
            let advancedMnav = null;
            let naiveMnavAdjustedPrice = null;
            let advancedMnavAdjustedPrice = null;

            if (marketCap > 0 && btcHoldings > 0 && spotPrice > 0) {
                const btcNav = btcHoldings * spotPrice;

                // Naive MNAV: just market cap / BTC NAV
                naiveMnav = marketCap / btcNav;
                naiveMnavAdjustedPrice = naiveMnav * spotPrice;

                // Advanced MNAV: (Market Cap + Debt + Preferred) / BTC NAV
                const enterpriseValue = marketCap + debt + pref;
                advancedMnav = enterpriseValue / btcNav;
                advancedMnavAdjustedPrice = advancedMnav * spotPrice;
            }

            mnavData.push({
                date,
                spotPrice: spotPrice ?? null,
                naiveMnav: naiveMnav ?? null,
                advancedMnav: advancedMnav ?? null,
                naiveMnavAdjustedPrice: naiveMnavAdjustedPrice ?? null,
                advancedMnavAdjustedPrice: advancedMnavAdjustedPrice ?? null,
                btcHoldings: btcHoldings ?? null,
                marketCap: marketCap ?? null,
                debt: debt ?? null,
                pref: pref ?? null,
                mstrSharePrice: mstrSharePrice ?? null,
                btcNav: btcHoldings && spotPrice ? btcHoldings * spotPrice : null
            });
        }

        // Sort by date (oldest first) since MSTR.csv is in reverse chronological order
        mnavData.sort((a, b) => a.date.localeCompare(b.date));

        // Filter to only keep weekly data points (last day of each week with data)
        // Normalize all dates to Monday of that week for consistent matching
        const weeklyData = new Map();
        for (const entry of mnavData) {
            const isoWeek = getISOWeek(entry.date); // YYYY-Www format
            const normalizedDate = getMondayOfWeek(entry.date);
            weeklyData.set(isoWeek, {
                ...entry,
                date: normalizedDate // Normalize to Monday
            });
        }

        // Convert map to array and sort by date
        const filteredMnavData = Array.from(weeklyData.values()).sort((a, b) =>
            a.date.localeCompare(b.date)
        );

        console.log(`✅ Read ${mnavData.length} total MNAV records, filtered to ${filteredMnavData.length} weekly data points`);
        return filteredMnavData;
    } catch (error) {
        console.log(`❌ Error reading MNAV data: ${error.message}`);
        return [];
    }
}


function linRegressXY(X, Y) {
    const n = Math.min(X.length, Y.length);
    if (n === 0) return { slope: 0, intercept: 0 };
    let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
    for (let i = 0; i < n; i++) {
        const x = X[i];
        const y = Y[i];
        sumX += x;
        sumY += y;
        sumXX += x * x;
        sumXY += x * y;
    }
    const denom = (n * sumXX - sumX * sumX) || 1e-12;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
}

function fitRainbowModel(series) {
    // series: [{date, price}] with positive prices
    const clean = series.filter(d => d && isFinite(d.price) && d.price > 0);
    const n = clean.length;
    if (n < 10) return null;
    const x = Array.from({ length: n }, (_, i) => i + 1);
    const y = clean.map(d => Math.log(d.price)); // natural log like reference

    // Search for b >= 0, coarse to fine. Upper bound ~ 2x length, capped.
    const bMin = 0;
    const bMax = Math.max(2000, Math.min(10000, n * 2));
    let best = { b: 0, a: 0, c: 0, sse: Infinity };

    function evalB(b) {
        // Compute X = ln(b + x)
        const X = x.map(v => Math.log(b + v));
        const { slope: a, intercept: c } = linRegressXY(X, y);
        // SSE
        let sse = 0;
        for (let i = 0; i < n; i++) {
            const yi = a * X[i] + c;
            const e = y[i] - yi;
            sse += e * e;
        }
        return { a, b, c, sse };
    }

    // Coarse grid
    const coarseSteps = 100;
    let coarseStep = (bMax - bMin) / coarseSteps;
    for (let i = 0; i <= coarseSteps; i++) {
        const b = bMin + i * coarseStep;
        const res = evalB(b);
        if (res.sse < best.sse) best = res;
    }

    // Refinements around best b
    for (let round = 0; round < 3; round++) {
        const span = coarseStep * 2;
        const left = Math.max(bMin, best.b - span);
        const right = Math.min(bMax, best.b + span);
        const steps = 50;
        const step = (right - left) / steps;
        for (let i = 0; i <= steps; i++) {
            const b = left + i * step;
            const res = evalB(b);
            if (res.sse < best.sse) best = res;
        }
        coarseStep = Math.max(step, 1e-6);
    }

    return {
        a: best.a,
        b: best.b,
        c: best.c,
        bandWidth: 0.3,
        numBands: 9,
        iDecrease: 1.5,
    };
}

/**
 * Write data to data.js file
 */
function writeDataJs(btcData, mnavData, strDataMap, filepath) {
    try {
        const timestamp = new Date().toISOString();
        // Fit reference rainbow models
        const rainbowModelBTC = fitRainbowModel(btcData);
        // Use advanced MNAV for rainbow model fitting
        const mnavSeries = mnavData
            .filter(d => isFinite(d.advancedMnavAdjustedPrice) && d.advancedMnavAdjustedPrice > 0)
            .map(d => ({ date: d.date, price: d.advancedMnavAdjustedPrice }));
        const rainbowModelMNAV = fitRainbowModel(mnavSeries);
        const jsContent = `// Bitcoin Rainbow Chart Data
// Last updated: ${timestamp}
// Generated by update-data.js

const btcHistoricalData = ${JSON.stringify(btcData, null, 2)};

const mnavHistoricalData = ${JSON.stringify(mnavData, null, 2)};

const strHistoricalData = ${JSON.stringify(strDataMap, null, 2)};

const rainbowModelBTC = ${JSON.stringify(rainbowModelBTC, null, 2)};
const rainbowModelMNAV = ${JSON.stringify(rainbowModelMNAV, null, 2)};
`;

        fs.writeFileSync(filepath, jsContent);

        console.log(`✅ Written data.js with ${btcData.length} BTC records and ${mnavData.length} MNAV records`);
        if (rainbowModelBTC) {
            console.log(`📐 BTC model: a=${rainbowModelBTC.a.toFixed(4)} b=${rainbowModelBTC.b.toFixed(2)} c=${rainbowModelBTC.c.toFixed(4)}`);
        }
        if (rainbowModelMNAV) {
            console.log(`📐 MNAV model: a=${rainbowModelMNAV.a.toFixed(4)} b=${rainbowModelMNAV.b.toFixed(2)} c=${rainbowModelMNAV.c.toFixed(4)}`);
        }
        if (btcData.length > 0) {
            console.log(`📊 BTC data range: ${btcData[0].date} to ${btcData[btcData.length - 1].date}`);
        }
        if (mnavData.length > 0) {
            console.log(`📊 MNAV data range: ${mnavData[0].date} to ${mnavData[mnavData.length - 1].date}`);
        }
        return true;
    } catch (error) {
        console.log(`❌ Error writing data.js: ${error.message}`);
        return false;
    }
}

/**
 * Main function
 */
async function main() {
    console.log('🚀 Starting data update...');
    console.log('-'.repeat(50));

    // Check if CSV files exist
    if (!fs.existsSync(BTC_CSV_PATH)) {
        console.log(`⚠️  ${BTC_CSV_PATH} not found`);
        console.log('Please ensure the CSV file exists or configure download URLs');

        // Uncomment to download from URL
        // if (typeof BTC_CSV_URL !== 'undefined') {
        //     await downloadFile(BTC_CSV_URL, BTC_CSV_PATH);
        // } else {
        //     process.exit(1);
        // }
    }

    if (!fs.existsSync(MNAV_CSV_PATH)) {
        console.log(`⚠️  ${MNAV_CSV_PATH} not found`);
        console.log('Please ensure the CSV file exists or configure download URLs');

        // Uncomment to download from URL
        // if (typeof MNAV_CSV_URL !== 'undefined') {
        //     await downloadFile(MNAV_CSV_URL, MNAV_CSV_PATH);
        // } else {
        //     process.exit(1);
        // }
    }

    // Read data from CSV files
    const btcData = readBtcData(BTC_CSV_PATH);
    const mnavData = readMnavData(MNAV_CSV_PATH);

    // Read STR preferred stock data
    const strDataMap = {};
    for (const [strName, strFile] of Object.entries(STR_FILES)) {
        strDataMap[strName] = readStrData(strFile, strName);
    }

    if (btcData.length === 0 && mnavData.length === 0) {
        console.log('❌ No data found to write');
        process.exit(1);
    }

    // Write to data.js
    if (writeDataJs(btcData, mnavData, strDataMap, OUTPUT_JS_PATH)) {
        console.log('-'.repeat(50));
        console.log('✨ Data update complete!');
        console.log(`📁 Output file: ${OUTPUT_JS_PATH}`);
    } else {
        console.log('❌ Failed to update data.js');
        process.exit(1);
    }
}

// Run the main function
main().catch(error => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
});
