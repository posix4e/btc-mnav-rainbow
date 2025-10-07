#!/usr/bin/env python3
import csv
import json

# Read BTC historical data
btc_data = []
with open('btc_historical_prices.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        btc_data.append({
            'date': row['# date'].replace('# ', ''),
            'price': float(row['btc_price_usd'])
        })

# Read MNAV data
mnav_data = []
with open('btc_mnav_merged.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        mnav_data.append({
            'date': row['# date'].replace('# ', ''),
            'spotPrice': float(row['spot btc_price_usd']),
            'mnav': float(row['MNAV']),
            'mnavAdjustedPrice': float(row['MNAV_x_BTC_Price']),
            'btcHoldings': float(row['MSTR_BTC_Holdings']),
            'marketCap': float(row['MSTR_Market_Cap_USD'])
        })

# Read the HTML template
with open('index.html', 'r') as f:
    html_content = f.read()

# Replace the fetch calls with embedded data
html_content = html_content.replace(
    "async function loadData() {",
    f"""async function loadData() {{
        // Embedded data
        btcData = {json.dumps(btc_data)};
        mnavData = {json.dumps(mnav_data)};

        createChart();
        updateStats();
        return;

        // Original fetch code (now skipped)"""
)

# Write the updated HTML
with open('index.html', 'w') as f:
    f.write(html_content)

print("✅ Data embedded into index.html successfully!")
print("The HTML file now contains all data and will work on GitHub Pages without CORS issues.")