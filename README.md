# Bitcoin Rainbow Chart with MSTR MNAV Comparison

A visualization tool comparing Bitcoin's spot price with MicroStrategy's MNAV-adjusted price using the rainbow chart model.

🌐 **Live Demo: [https://posix4e.github.io/btc-mnav-rainbow/](https://posix4e.github.io/btc-mnav-rainbow/)**

## Features

- 🌈 Rainbow bands showing market cycles (Fire Sale → Maximum Bubble)
- 📊 Compare BTC spot price vs MSTR MNAV-adjusted price
- 📈 Logarithmic and linear regression models
- 🎯 Custom parameter adjustments
- ⚡ Bitcoin halving markers
- 📱 Responsive design

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Generate Data
```bash
npm run update-data
```
This reads the CSV files and generates `data.js`

### 3. Start Local Server
```bash
npm run serve
```
Then open http://localhost:8080 in your browser

## Updating Data

Place updated CSV files in the project root:
- `btc_historical_prices.csv` - Bitcoin price history
- `btc_mnav_merged.csv` - MSTR MNAV data

Then run:
```bash
npm run update-data
```

## Project Structure

```
├── index.html          # Main HTML file
├── chart.js           # Chart logic and configuration
├── styles.css         # Styling
├── data.js            # Generated data file (git-ignored)
├── update-data.js     # Data update script
├── package.json       # Node.js dependencies
├── *.csv             # Source data files
└── README.md         # This file
```

## CSV Data Format

### btc_historical_prices.csv
- `date` - Date in YYYY-MM-DD format
- `btc_price_usd` - Bitcoin price in USD

### btc_mnav_merged.csv
- `date` - Date in YYYY-MM-DD format
- `spot btc_price_usd` - Spot BTC price
- `MNAV` - MSTR Net Asset Value multiple
- `MNAV_x_BTC_Price` - MNAV-adjusted price
- `MSTR_BTC_Holdings` - MicroStrategy BTC holdings
- `MSTR_Market_Cap_USD` - MicroStrategy market cap

## Development

### Available Scripts
- `npm run update-data` - Regenerate data.js from CSV files
- `npm run serve` - Start local development server
- `npm run dev` - Alias for serve

### Customizing Data Sources
Edit `update-data.js` to add remote data source URLs if needed.

## GitHub Pages Deployment

The site is automatically built and deployed to GitHub Pages via GitHub Actions. The workflow:

1. **Builds the site** - Installs npm dependencies and generates `data.js` from CSV files
2. **Deploys to Pages** - Publishes the complete site to GitHub Pages

### When it runs:
- ✅ Automatically on every push to `main` branch
- 🎯 On manual trigger from Actions tab

### Important:
- `data.js` is git-ignored locally but generated fresh during each deployment
- CSV data files must be committed to the repository
- No need to manually commit `data.js` - it's built automatically!

## License

MIT