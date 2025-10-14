const fs = require('fs');
const https = require('https');

function fetchDailySatPrice() {
    return new Promise((resolve, reject) => {
        const url = 'https://dailysatprice.com/data/latest.csv';

        https.get(url, (response) => {
            let data = '';

            response.on('data', (chunk) => {
                data += chunk;
            });

            response.on('end', () => {
                resolve(data);
            });

        }).on('error', (err) => {
            reject(err);
        });
    });
}

async function updateBtcData() {
    try {
        console.log('Fetching BTC price data from dailysatprice.com...');
        const csvData = await fetchDailySatPrice();

        // Write the CSV data directly to file
        fs.writeFileSync('dailysatprice_latest.csv', csvData);

        const lines = csvData.trim().split('\n');
        console.log(`✅ Downloaded ${lines.length - 1} records from dailysatprice.com`);

        if (lines.length > 1) {
            const lastLine = lines[lines.length - 1];
            const [lastDate] = lastLine.split(',');
            console.log(`📊 Latest date in CSV: ${lastDate}`);
        }

        console.log('✅ Saved to dailysatprice_latest.csv');

    } catch (error) {
        console.error('Error updating BTC data:', error);
        process.exit(1);
    }
}

updateBtcData();