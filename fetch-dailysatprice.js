const fs = require('fs');
const https = require('https');

const URL = 'https://dailysatprice.com/data/latest.csv';
const OUT = 'dailysatprice_latest.csv';
// Upstream normally lags 1-2 days; anything older means the feed is stuck.
const MAX_STALE_DAYS = 7;

function fetchText(url, redirectsLeft = 3) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'btc-mnav-rainbow' } }, (res) => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirectsLeft > 0) {
                res.resume();
                return resolve(fetchText(new URL(res.headers.location, url).toString(), redirectsLeft - 1));
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
            }
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function validate(csv) {
    const lines = csv.trim().split(/\r?\n/);
    if (lines[0].trim() !== 'date,price') {
        throw new Error(`Unexpected header: ${JSON.stringify(lines[0].slice(0, 80))}`);
    }
    if (lines.length < 1000) {
        throw new Error(`Only ${lines.length - 1} rows; expected full history`);
    }
    const [lastDate, lastPrice] = lines[lines.length - 1].split(',');
    const price = Number(lastPrice);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastDate) || !(price > 0)) {
        throw new Error(`Bad last row: ${lines[lines.length - 1]}`);
    }
    const ageDays = (Date.now() - Date.parse(lastDate + 'T00:00:00Z')) / 86400000;
    if (ageDays > MAX_STALE_DAYS) {
        throw new Error(`Feed is stale: last date ${lastDate} is ${Math.floor(ageDays)} days old`);
    }
    return { rows: lines.length - 1, lastDate, price };
}

async function updateBtcData() {
    try {
        console.log('Fetching BTC price data from dailysatprice.com...');
        const csv = await fetchText(URL);
        const { rows, lastDate, price } = validate(csv);
        fs.writeFileSync(OUT, csv.trim() + '\n');
        console.log(`✅ ${rows} records; latest ${lastDate} = $${price}`);
        console.log(`✅ Saved to ${OUT}`);
    } catch (error) {
        // Fail the job so a bad fetch never ships, and so the failure is visible.
        console.error('❌ Error updating BTC data:', error.message);
        process.exit(1);
    }
}

updateBtcData();
