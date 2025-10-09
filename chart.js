let chart = null;
let btcData = [];
let mnavData = [];

// Preset controls removed; model parameters come from data.js

// Reference rainbow palette (bottom → top) from StephanAkkerman/bitcoin-rainbow-chart
const referenceRainbowHex = [
    '#4472c4', // Fire sale!
    '#54989f', // BUY!
    '#63be7b', // Accumulate
    '#b1d580', // Still cheap
    '#feeb84', // HODL!
    '#f6b45a', // Is this a bubble?
    '#ed7d31', // FOMO Intensifies
    '#d64018', // Sell. Seriously, SELL!
    '#c00200', // Maximum bubble territory
];

function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const rainbowColors = referenceRainbowHex.map((hex) => hexToRgba(hex, 0.2));

// Rainbow band offsets are computed dynamically from bandWidth and bandCount

// Bitcoin halving dates
const halvingDates = [
    { date: '2012-11-28', label: '1st Halving', blockReward: '25 BTC' },
    { date: '2016-07-09', label: '2nd Halving', blockReward: '12.5 BTC' },
    { date: '2020-05-11', label: '3rd Halving', blockReward: '6.25 BTC' },
    { date: '2024-04-20', label: '4th Halving', blockReward: '3.125 BTC' },
    { date: '2028-04-01', label: '5th Halving (Est.)', blockReward: '1.5625 BTC' }
];

async function loadData() {
    // Use data from data.js
    btcData = btcHistoricalData;
    mnavData = mnavHistoricalData;

    createChart();
    updateStats();
}

function generateExtendedDates(dates, months = 9) {
    // Extend dates by N months (approximate as 30 days per month)
    const result = [...dates];
    if (!dates.length) return result;
    const last = new Date(dates[dates.length - 1]);
    const totalDays = months * 30;
    for (let i = 1; i <= totalDays; i++) {
        const d = new Date(last.getTime());
        d.setDate(d.getDate() + i);
        result.push(d.toISOString().split('T')[0]);
    }
    return result;
}

// Regression presets removed; using fitted reference model from data.js

function generateRainbowBands(datesOrData, regression) {
    const config = presetConfigs[currentPreset];
    const bandCount = config.bandCount;
    const bandWidth = config.bandWidth;

    const bands = [];
    const dates = Array.isArray(datesOrData)
        ? (typeof datesOrData[0] === 'string' ? datesOrData : datesOrData.map(d => d.date))
        : [];

    // Generate band offsets based on configuration
    const bandOffsets = [];
    for (let i = 0; i < bandCount; i++) {
        const offset = -bandWidth * (bandCount - 1) / 2 + i * bandWidth;
        bandOffsets.push(offset);
    }

    for (let i = 0; i < bandOffsets.length; i++) {
        const bandData = dates.map(date => {
            // Use the regression's predict function to get the base price
            const basePrice = regression.predict(date);
            // Apply band offset in log space
            const logBasePrice = Math.log10(basePrice);
            const logBandPrice = logBasePrice + bandOffsets[i];
            return Math.pow(10, logBandPrice);
        });

        if (i === 0) {
            bands.push({
                label: '',
                data: bandData,
                borderColor: 'transparent',
                backgroundColor: 'transparent',
                fill: false,
                pointRadius: 0,
                tension: 0,
                order: 10 + i
            });
        }

        // Map colors based on band position
        const colorIndex = Math.floor(i * rainbowColors.length / bandCount);
        bands.push({
            label: '',
            data: bandData,
            borderColor: 'transparent',
            backgroundColor: rainbowColors[Math.min(colorIndex, rainbowColors.length - 1)],
            fill: i === 0 ? false : '-1',
            pointRadius: 0,
            tension: 0,
            order: 10 + i
        });
    }

    return bands;
}

function rebuildChart() {
    if (chart) {
        chart.destroy();
    }
    createChart();
}

function computeModelSeries(length, model) {
    if (!model) return Array.from({ length }, () => null);
    const { a, b, c } = model;
    const result = new Array(length);
    for (let i = 0; i < length; i++) {
        const x = i + 1; // 1..N like reference
        const yhat = a * Math.log(b + x) + c;
        result[i] = Math.exp(yhat);
    }
    return result;
}

function createChart() {
    const ctx = document.getElementById('rainbowChart').getContext('2d');

    // Build extended date axis (9 months ahead)
    const baseDates = btcData.map(d => d.date);
    const extendedDates = generateExtendedDates(baseDates, 9);

    // Compute model baselines (center) from fitted reference equations
    const btcBaseline = computeModelSeries(extendedDates.length, typeof rainbowModelBTC !== 'undefined' ? rainbowModelBTC : null);
    const mnavBaselineRaw = computeModelSeries(mnavData.length, typeof rainbowModelMNAV !== 'undefined' ? rainbowModelMNAV : null);

    // Generate rainbow bands using reference band logic
    function buildBands(baseline, model, orderBase) {
        const bands = [];
        if (!model || !baseline || baseline.length === 0) return bands;
        const numBands = model.numBands || 9;
        const bandWidth = model.bandWidth || 0.3;
        const iDecrease = model.iDecrease != null ? model.iDecrease : 1.5;

        // Helper to shift in log space
        const lower0 = baseline.map(v => Math.exp(Math.log(v) + (0 - iDecrease) * bandWidth - bandWidth));
        // Seed transparent lower baseline for first fill
        bands.push({
            label: '',
            data: lower0,
            borderColor: 'transparent',
            backgroundColor: 'transparent',
            fill: false,
            pointRadius: 0,
            tension: 0,
            order: orderBase,
        });
        for (let i = 0; i < numBands; i++) {
            const upper = baseline.map(v => Math.exp(Math.log(v) + (i - iDecrease) * bandWidth));
            const colorIndex = Math.min(i, rainbowColors.length - 1);
            bands.push({
                label: '',
                data: upper,
                borderColor: 'transparent',
                backgroundColor: rainbowColors[colorIndex],
                fill: '-1',
                pointRadius: 0,
                tension: 0,
                order: orderBase + 1 + i,
            });
        }
        return bands;
    }
    const btcRainbowBands = buildBands(btcBaseline, typeof rainbowModelBTC !== 'undefined' ? rainbowModelBTC : null, 10);
    const mnavRainbowBandsRaw = buildBands(mnavBaselineRaw, typeof rainbowModelMNAV !== 'undefined' ? rainbowModelMNAV : null, 30);

    // Create aligned data for MSTR MNAV (with null values before 2022)
    const mnavAlignedData = extendedDates.map(date => {
        const mnavItem = mnavData.find(m => m.date === date);
        return mnavItem ? mnavItem.mnavAdjustedPrice : null;
    });

    // Create halving annotations
    const halvingAnnotations = {};
    halvingDates.forEach((halving, index) => {
        halvingAnnotations[`halving${index}`] = {
            type: 'line',
            borderColor: 'white',
            borderWidth: 1,
            label: {
                content: halving.label,
                enabled: true,
                position: 'start',
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                color: 'white',
                font: {
                    size: 11
                },
                rotation: 270,
                yAdjust: -60
            },
            scaleID: 'x',
            value: halving.date
        };
    });

    // No trend lines in reference chart

    const datasets = [
        // BTC Spot Price
        {
            label: 'BTC Spot Price',
            data: extendedDates.map(date => {
                const item = btcData.find(d => d.date === date);
                return item ? item.price : null; // no future price
            }),
            borderColor: 'rgb(255, 159, 64)',
            backgroundColor: 'rgba(255, 159, 64, 0.1)',
            borderWidth: 3,
            fill: false,
            pointRadius: 0,
            tension: 0,
            order: 1,
            spanGaps: false
        },
        // MSTR MNAV-Adjusted Price
        {
            label: 'MSTR MNAV-Adjusted Price',
            data: mnavAlignedData,
            borderColor: 'rgb(153, 102, 255)',
            backgroundColor: 'rgba(153, 102, 255, 0.1)',
            borderWidth: 3,
            fill: false,
            pointRadius: 0,
            tension: 0,
            order: 2,
            spanGaps: false
        }
    ];

    // Add rainbow bands
    btcRainbowBands.forEach(band => {
        band.hidden = false;
        datasets.push(band);
    });

    // Align MNAV rainbow bands with extended BTC dates (null where MNAV missing)
    mnavRainbowBandsRaw.forEach((band) => {
        const alignedData = extendedDates.map(date => {
            const mnavIndex = mnavData.findIndex(m => m.date === date);
            return mnavIndex !== -1 ? band.data[mnavIndex] : null;
        });
        band.data = alignedData;
        band.hidden = true;
        band.spanGaps = false;
        datasets.push(band);
    });

    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: extendedDates,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                annotation: {
                    annotations: halvingAnnotations
                },
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        filter: function(item) {
                            return item.text !== '';
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            if (context.dataset.label === '') return null;
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': $';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toLocaleString('en-US', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                });
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        parser: 'yyyy-MM-dd',
                        displayFormats: {
                            year: 'yyyy'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Date'
                    }
                },
                y: {
                    type: 'logarithmic',
                    title: {
                        display: true,
                        text: 'Price (USD) - Log Scale'
                    },
                    ticks: {
                        callback: function(value) {
                            return '$' + value.toLocaleString('en-US');
                        }
                    }
                }
            }
        }
    });

    // Setup toggles
    setupToggles();
}

function setupToggles() {
    document.getElementById('showSpot').addEventListener('change', function(e) {
        chart.data.datasets[0].hidden = !e.target.checked;
        chart.update();
    });

    document.getElementById('showMNAV').addEventListener('change', function(e) {
        chart.data.datasets[1].hidden = !e.target.checked;
        chart.update();
    });

    document.getElementById('showSpotRainbow').addEventListener('change', function(e) {
        const startIdx = 2;
        const endIdx = startIdx + 20;
        for (let i = startIdx; i < endIdx && i < chart.data.datasets.length; i++) {
            if (chart.data.datasets[i].order >= 10 && chart.data.datasets[i].order < 30) {
                chart.data.datasets[i].hidden = !e.target.checked;
            }
        }
        chart.update();
    });

    document.getElementById('showMNAVRainbow').addEventListener('change', function(e) {
        const startIdx = 22;
        for (let i = startIdx; i < chart.data.datasets.length; i++) {
            if (chart.data.datasets[i].order >= 30) {
                chart.data.datasets[i].hidden = !e.target.checked;
            }
        }
        chart.update();
    });

    document.getElementById('showHalvings').addEventListener('change', function(e) {
        Object.keys(chart.options.plugins.annotation.annotations).forEach(key => {
            if (key.startsWith('halving')) {
                chart.options.plugins.annotation.annotations[key].display = e.target.checked;
            }
        });
        chart.update();
    });

    // Time range buttons
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const range = this.dataset.range;
            const today = new Date();
            let minDate = null;
            let maxDate = today; // Default to today to avoid showing future data

            switch(range) {
                case '1Y':
                    minDate = new Date(today);
                    minDate.setFullYear(minDate.getFullYear() - 1);
                    break;
                case '3Y':
                    minDate = new Date(today);
                    minDate.setFullYear(minDate.getFullYear() - 3);
                    break;
                case '5Y':
                    minDate = new Date(today);
                    minDate.setFullYear(minDate.getFullYear() - 5);
                    break;
                case 'ALL':
                default:
                    minDate = null;
                    maxDate = null; // Show all data including future for ALL
            }

            if (minDate) {
                chart.options.scales.x.min = minDate.toISOString().split('T')[0];
            } else {
                delete chart.options.scales.x.min;
            }

            if (maxDate) {
                chart.options.scales.x.max = maxDate.toISOString().split('T')[0];
            } else {
                delete chart.options.scales.x.max;
            }

            chart.update();
        });
    });

}

function updateStats() {
    const latestBTC = btcData[btcData.length - 1];
    const latestMNAV = mnavData[mnavData.length - 1];

    const statsHTML = `
        <div class="stat-card">
            <h3>Latest BTC Spot Price</h3>
            <p>$${latestBTC.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
        </div>
        <div class="stat-card">
            <h3>Latest MNAV-Adjusted Price</h3>
            <p>$${latestMNAV.mnavAdjustedPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
        </div>
        <div class="stat-card">
            <h3>MSTR MNAV Premium</h3>
            <p>${(latestMNAV.mnav * 100).toFixed(1)}%</p>
        </div>
        <div class="stat-card">
            <h3>MSTR BTC Holdings</h3>
            <p>${latestMNAV.btcHoldings.toLocaleString('en-US', { maximumFractionDigits: 0 })} BTC</p>
        </div>
    `;

    document.getElementById('stats').innerHTML = statsHTML;
}

// Load data when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    loadData();
});
