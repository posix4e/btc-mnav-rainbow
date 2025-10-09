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
const BTC_CSV_PATH = 'btc_historical_prices.csv';
const MNAV_CSV_PATH = 'btc_mnav_merged.csv';
const OUTPUT_JS_PATH = 'data.js';
const SHARE_CLASSES_JSON = path.join('data', 'share_classes.json');

// Optional: URLs to download CSV files from
// const BTC_CSV_URL = 'https://example.com/btc_historical_prices.csv';
// const MNAV_CSV_URL = 'https://example.com/btc_mnav_merged.csv';

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

        const btcData = [];
        for (const row of records) {
            // Handle potential # prefix in column names
            const date = (row['# date'] || row['date'] || '').replace('# ', '');
            const price = parseFloat(row['btc_price_usd'] || row['price'] || 0);

            if (date && price > 0) {
                btcData.push({
                    date: date,
                    price: price
                });
            }
        }

        console.log(`✅ Read ${btcData.length} BTC price records`);
        return btcData;
    } catch (error) {
        console.log(`❌ Error reading BTC data: ${error.message}`);
        return [];
    }
}

/**
 * Read MNAV data from CSV
 * Optionally supports multiple share classes to recompute market cap/MNAV when provided.
 * Optional columns supported (case-insensitive, multiple aliases):
 * - Class A shares: class_a_shares, classAShares, MSTR_ClassA_Shares
 * - Class B shares: class_b_shares, classBShares, MSTR_ClassB_Shares
 * - Conversion (B->A): class_b_to_a, classB_to_A, conv_b_to_a (default 1)
 * - MSTR share price (Class A): mstr_price_usd, class_a_price, MSTR_ClassA_Price
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
            // Handle potential # prefix in column names
            const date = (row['# date'] || row['date'] || '').replace('# ', '');
            if (!date) continue;

            const toNum = (v) => {
                const n = parseFloat(v);
                return Number.isFinite(n) ? n : null;
            };
            const spotPrice = toNum(row['spot btc_price_usd'] || row['spotPrice']);
            const btcHoldings = toNum(row['MSTR_BTC_Holdings'] || row['btcHoldings']);
            let marketCap = toNum(row['MSTR_Market_Cap_USD'] || row['marketCap']);

            // Optional share class fields
            const classAShares = toNum(row['class_a_shares'] || row['classAShares'] || row['MSTR_ClassA_Shares']);
            const classBShares = toNum(row['class_b_shares'] || row['classBShares'] || row['MSTR_ClassB_Shares']);
            const classBtoA = toNum(row['class_b_to_a'] || row['classB_to_A'] || row['conv_b_to_a']) ?? 1; // default 1:1 conversion
            const mstrSharePrice = toNum(row['mstr_price_usd'] || row['class_a_price'] || row['MSTR_ClassA_Price']);

            // If we have share counts and a share price but no market cap, compute it
            let effectiveShares = null;
            if ((classAShares != null || classBShares != null)) {
                effectiveShares = (classAShares || 0) + (classBShares || 0) * (classBtoA || 1);
            }
            if ((marketCap == null || !(marketCap > 0)) && mstrSharePrice != null && mstrSharePrice > 0 && effectiveShares != null && effectiveShares > 0) {
                marketCap = mstrSharePrice * effectiveShares;
            }

            // Base MNAV fields (from CSV if present)
            let mnav = toNum(row['MNAV'] || row['mnav']);
            let mnavAdjustedPrice = toNum(row['MNAV_x_BTC_Price'] || row['mnavAdjustedPrice']);

            // If we have the components, recompute MNAV and adjusted price
            if ((spotPrice != null && spotPrice > 0) && (btcHoldings != null && btcHoldings > 0) && (marketCap != null && marketCap > 0)) {
                const navTheoretical = spotPrice * btcHoldings;
                if (isFinite(navTheoretical) && navTheoretical > 0) {
                    mnav = marketCap / navTheoretical;
                    mnavAdjustedPrice = mnav * spotPrice;
                }
            }

            mnavData.push({
                date,
                spotPrice: spotPrice ?? null,
                mnav: mnav ?? null,
                mnavAdjustedPrice: mnavAdjustedPrice ?? null,
                btcHoldings: btcHoldings ?? null,
                marketCap: marketCap ?? null,
                classAShares: classAShares ?? null,
                classBShares: classBShares ?? null,
                classBtoA: classBtoA ?? null,
                mstrSharePrice: mstrSharePrice ?? null,
                effectiveShares: effectiveShares ?? null,
            });
        }

        console.log(`✅ Read ${mnavData.length} MNAV records`);
        return mnavData;
    } catch (error) {
        console.log(`❌ Error reading MNAV data: ${error.message}`);
        return [];
    }
}

/**
 * Read share classes time series JSON if present
 */
function readShareClasses(filepath) {
    try {
        if (!fs.existsSync(filepath)) {
            console.log(`ℹ️  Share-classes file not found: ${filepath}`);
            return [];
        }
        const raw = fs.readFileSync(filepath, 'utf-8');
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        // Normalize
        const norm = arr.map(r => ({
            date: r.date,
            classAShares: Number.isFinite(r.classAShares) ? r.classAShares : null,
            classBShares: Number.isFinite(r.classBShares) ? r.classBShares : null,
            classBtoA: Number.isFinite(r.classBtoA) ? r.classBtoA : 1,
        })).filter(r => r.date);
        norm.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        console.log(`✅ Read ${norm.length} share-class records`);
        return norm;
    } catch (e) {
        console.log(`❌ Error reading share classes: ${e.message}`);
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
function writeDataJs(btcData, mnavData, filepath) {
    try {
        const timestamp = new Date().toISOString();
        // Fit reference rainbow models
        const rainbowModelBTC = fitRainbowModel(btcData);
        const mnavSeries = mnavData
            .filter(d => isFinite(d.mnavAdjustedPrice) && d.mnavAdjustedPrice > 0)
            .map(d => ({ date: d.date, price: d.mnavAdjustedPrice }));
        const rainbowModelMNAV = fitRainbowModel(mnavSeries);
        const jsContent = `// Bitcoin Rainbow Chart Data
// Last updated: ${timestamp}
// Generated by update-data.js

const btcHistoricalData = ${JSON.stringify(btcData, null, 2)};

const mnavHistoricalData = ${JSON.stringify(mnavData, null, 2)};

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
    const shareClasses = readShareClasses(SHARE_CLASSES_JSON);

    // Merge share classes by forward-fill onto mnavData
    if (shareClasses.length > 0 && mnavData.length > 0) {
        let idx = 0;
        let current = null;
        const byDate = (d) => d && d.date;
        mnavData.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        for (const row of mnavData) {
            while (idx < shareClasses.length && shareClasses[idx].date <= row.date) {
                current = shareClasses[idx];
                idx++;
            }
            if (current) {
                if (row.classAShares == null) row.classAShares = current.classAShares;
                if (row.classBShares == null) row.classBShares = current.classBShares;
                if (row.classBtoA == null) row.classBtoA = current.classBtoA;
                const eff = (row.classAShares || 0) + (row.classBShares || 0) * (row.classBtoA || 1);
                if (!row.effectiveShares && eff > 0) row.effectiveShares = eff;
                // If we can complete marketCap from shares and price
                if ((!row.marketCap || !(row.marketCap > 0)) && row.mstrSharePrice && eff > 0) {
                    row.marketCap = row.mstrSharePrice * eff;
                }
                // Recompute MNAV if components present
                if (row.spotPrice && row.spotPrice > 0 && row.btcHoldings && row.btcHoldings > 0 && row.marketCap && row.marketCap > 0) {
                    const navTheoretical = row.spotPrice * row.btcHoldings;
                    if (isFinite(navTheoretical) && navTheoretical > 0) {
                        row.mnav = row.marketCap / navTheoretical;
                        row.mnavAdjustedPrice = row.mnav * row.spotPrice;
                    }
                }
            }
        }
    }

    if (btcData.length === 0 && mnavData.length === 0) {
        console.log('❌ No data found to write');
        process.exit(1);
    }

    // Write to data.js
    if (writeDataJs(btcData, mnavData, OUTPUT_JS_PATH)) {
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
