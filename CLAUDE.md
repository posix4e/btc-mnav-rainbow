# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Bitcoin Rainbow Chart visualization tool that compares Bitcoin's spot price with MicroStrategy's Modified Net Asset Value (MNAV) using rainbow chart analysis. The site generates rainbow bands based on logarithmic regression models and displays interactive visualizations with toggleable components.

**Live Site**: https://strategyrainbow.com/

## Development Commands

### Initial Setup
```bash
npm install
npm run fetch-btc        # Fetch latest BTC price data from dailysatprice.com
npm run update-data      # Generate data.js from CSV files (dailysatprice_latest.csv, MSTR.csv, STR*.csv)
npm run serve           # Start local server at http://localhost:8080
```

### Development Workflow
```bash
npm run dev             # Alias for npm run serve
```

### Data Update Workflow
When updating with fresh data:
1. `npm run fetch-btc` - Fetches latest BTC prices, writes to `dailysatprice_latest.csv`
2. Download MSTR data CSVs from https://www.microstrategy.com/bitcoin-holdings
3. `npm run update-data` - Processes CSVs and generates `data.js` with weekly aggregated data
4. `npm run serve` - Test locally before committing

## Architecture

### Data Pipeline (update-data.js)
The data processing pipeline transforms CSV files into a unified `data.js` file:

1. **CSV Ingestion**: Reads Bitcoin prices (`dailysatprice_latest.csv`), MicroStrategy data (`MSTR.csv`), and preferred stock series (`STRC.csv`, `STRD.csv`, `STRF.csv`, `STRK.csv`)
2. **Weekly Aggregation**: Uses ISO week numbers to filter data to one point per week (last entry of each week), reducing data size while maintaining trend visibility
3. **MNAV Calculation**: Computes two MNAV types:
   - **Naive MNAV**: `marketCap / (btcHoldings × spotPrice)` - simple market cap ratio
   - **Advanced MNAV**: `(marketCap + debt + pref) / (btcHoldings × spotPrice)` - full enterprise value
4. **Rainbow Model Fitting**: Fits logarithmic regression model `y = a × ln(b + x) + c` to both BTC and MNAV price series using grid search optimization to minimize SSE
5. **Output**: Generates `data.js` with historical data arrays and fitted model parameters

### Chart Rendering (chart.js)
The visualization layer handles rainbow band generation and interactive updates:

1. **Rainbow Bands**: Generated from fitted model parameters using log-space offsets (`bandWidth`, `numBands`, `iDecrease`)
2. **Halving Coloring**: BTC price line segments colored by position in halving cycle (red→rainbow→red)
3. **Custom MNAV Calculator**: Real-time recalculation based on user-selected components (debt, STRC, STRD, STRF, STRK checkboxes)
4. **Time Range Controls**: Halving-based zoom buttons (1.5H, 2.5H, 3.5H = 1.5/2.5/3.5 × 1460 days)

### Key Data Structures
- `btcData`: `[{date, price}]` - weekly BTC spot prices
- `mnavData`: `[{date, spotPrice, naiveMnav, advancedMnav, naiveMnavAdjustedPrice, advancedMnavAdjustedPrice, btcHoldings, marketCap, debt, pref, mstrSharePrice, btcNav}]` - weekly MSTR data with calculated metrics
- `strData`: `{STRC: [...], STRD: [...], STRF: [...], STRK: [...]}` - preferred stock series with `{date, notional, marketCap, price}`
- `rainbowModelBTC/MNAV`: `{a, b, c, bandWidth, numBands, iDecrease}` - fitted regression parameters

## Deployment

### GitHub Actions Workflow
The site deploys automatically via `.github/workflows/update-data.yml`:
- **Trigger**: Push to main, daily at 2 AM UTC, or manual dispatch
- **Steps**:
  1. Fetches latest BTC data via `npm run fetch-btc`
  2. Generates `data.js` from committed CSVs
  3. Deploys to GitHub Pages

**Important**: `data.js` is git-ignored locally but generated fresh on each deployment. Always commit CSV files but never `data.js`.

## File Responsibilities

- `index.html`: UI structure with toggle controls and canvas element
- `chart.js`: Chart.js configuration, rainbow band math, custom MNAV calculator, event handlers
- `update-data.js`: CSV parsing, weekly aggregation, MNAV calculations, rainbow model fitting
- `fetch-dailysatprice.js`: BTC price fetcher (downloads latest data from dailysatprice.com)
- `data.js`: Generated output (arrays + model params) - DO NOT EDIT MANUALLY
- `styles.css`: Sidebar layout and toggle styling

## Rainbow Model Math

The rainbow bands use a logarithmic regression model fitted to historical price data:

```
price(x) = exp(a × ln(b + x) + c)
```

Where:
- `x` = data point index (1 to N)
- `a`, `b`, `c` = fitted parameters (optimized via grid search)
- Bands offset in log space: `band[i] = exp(ln(basePrice) + offset[i])`
- `offset[i] = (i - iDecrease) × bandWidth`

This creates parallel curves on logarithmic scale that capture Bitcoin's exponential growth trend.

## Testing Changes

After modifying data processing or chart logic:
1. Test with current CSV data: `npm run update-data && npm run serve`
2. Verify all toggle switches work (spot, naive MNAV, custom MNAV, rainbow bands, halvings)
3. Check custom MNAV updates when toggling debt/preferred stock checkboxes
4. Test zoom buttons (All, 1.5H, 2.5H, 3.5H)
5. Inspect generated `data.js` for expected data ranges and model parameters
