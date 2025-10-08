# Data Update Instructions

## Updating the Chart Data

The Bitcoin Rainbow Chart uses two CSV data files:
- `btc_historical_prices.csv` - Bitcoin historical price data
- `btc_mnav_merged.csv` - MSTR MNAV and related data

To update the chart with new data:

### 1. Update CSV Files
Place your updated CSV files in the project root directory with the same filenames.

### 2. Run the Update Script
```bash
python3 update_data.py
```

This will:
- Read both CSV files
- Process the data
- Generate/update `data.js` with the latest data
- Display statistics about the data range

### 3. Verify
Open `index.html` in a browser to verify the chart displays the new data.

## CSV File Format

### btc_historical_prices.csv
Required columns:
- `date` or `# date` - Date in YYYY-MM-DD format
- `btc_price_usd` - Bitcoin price in USD

### btc_mnav_merged.csv
Required columns:
- `date` or `# date` - Date in YYYY-MM-DD format
- `spot btc_price_usd` - Spot BTC price
- `MNAV` - MSTR Net Asset Value multiple
- `MNAV_x_BTC_Price` - MNAV-adjusted BTC price
- `MSTR_BTC_Holdings` - MicroStrategy's BTC holdings
- `MSTR_Market_Cap_USD` - MicroStrategy market cap

## Customizing Data Sources

To download data from remote URLs, edit `update_data.py` and:

1. Uncomment and set the URL variables:
```python
BTC_CSV_URL = 'https://your-source.com/btc_prices.csv'
MNAV_CSV_URL = 'https://your-source.com/mnav_data.csv'
```

2. Uncomment the download sections in the `main()` function

## Troubleshooting

- **Missing CSV files**: Ensure both CSV files exist in the project directory
- **Invalid data**: Check that dates are in YYYY-MM-DD format and prices are numeric
- **Script errors**: Run `python3 update_data.py` to see detailed error messages