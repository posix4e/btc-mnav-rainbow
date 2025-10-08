let chart = null;
let btcData = [];
let mnavData = [];
let currentPreset = 'logarithmic';
let customSettings = {
    slope: 0.00063,
    intercept: 1.85,
    bandWidth: 0.39,
    bandCount: 9
};
let pendingCustomSettings = { ...customSettings };

// Preset configurations matching Blockchain Center rainbow chart
const presetConfigs = {
    logarithmic: {
        // Power law regression (non-linear, long-term fit)
        // Matches the Blockchain Center "Logarithmic Regression" model
        // These values are calibrated to match their visual appearance
        slope: 0.0004783,  // Power law growth coefficient
        intercept: 2.5829,  // Starting point in log space
        bandWidth: 0.33,    // Band spacing in log space
        bandCount: 9,
        startYear: 2011
    },
    linear: {
        // Linear regression (straight line fit in log space)
        // Matches the Blockchain Center "Linear Regression" model
        // More conservative, typically uses data from 2014 onwards
        slope: 0.0005273,  // Linear growth in log space
        intercept: 2.3021,  // Y-intercept in log space
        bandWidth: 0.33,    // Same band spacing as logarithmic
        bandCount: 9,
        startYear: 2014
    },
    custom: customSettings
};

const rainbowColors = [
    'rgba(0, 0, 255, 0.2)',      // Fire Sale
    'rgba(0, 127, 255, 0.2)',    // BUY!
    'rgba(0, 255, 255, 0.2)',    // Accumulate
    'rgba(0, 255, 127, 0.2)',    // Still Cheap
    'rgba(0, 255, 0, 0.2)',      // HODLers Paradise
    'rgba(127, 255, 0, 0.2)',    // Is this a bubble?
    'rgba(255, 255, 0, 0.2)',    // FOMO Intensifies
    'rgba(255, 127, 0, 0.2)',    // Sell. Seriously, SELL!
    'rgba(255, 0, 0, 0.2)'       // Maximum Bubble Territory
];

// Rainbow band offsets in log space (from bottom to top)
const rainbowOffsets = [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8];

// Bitcoin halving dates
const halvingDates = [
    { date: '2012-11-28', label: '1st Halving', blockReward: '25 BTC' },
    { date: '2016-07-09', label: '2nd Halving', blockReward: '12.5 BTC' },
    { date: '2020-05-11', label: '3rd Halving', blockReward: '6.25 BTC' },
    { date: '2024-04-19', label: '4th Halving', blockReward: '3.125 BTC' },
    { date: '2028-04-01', label: '5th Halving (Est.)', blockReward: '1.5625 BTC' }
];

async function loadData() {
    // Use data from data.js
    btcData = btcHistoricalData;
    mnavData = mnavHistoricalData;

    createChart();
    updateStats();
}

function calculateRegression(data, usePreset = false) {
    const config = presetConfigs[currentPreset];
    // Use config start year if available, otherwise use 2010
    const startYear = config.startYear || 2010;
    const startDate = new Date(`${startYear}-01-01`);

    // If using preset with defined slope/intercept, use those
    if (usePreset && config.slope !== null && config.intercept !== null) {
        return {
            equation: [config.slope, config.intercept],
            firstDate: startDate,
            predict: (date) => {
                const daysSince = (new Date(date) - startDate) / (1000 * 60 * 60 * 24);
                const logPrice = config.slope * daysSince + config.intercept;
                return Math.pow(10, logPrice);
            }
        };
    }

    // Otherwise calculate from data
    const today = new Date();
    const historicalData = data.filter(d => {
        const date = new Date(d.date);
        return date <= today && date >= startDate;
    });

    // Skip if not enough data
    if (historicalData.length < 2) {
        return {
            equation: [0.0005, 2.5],
            firstDate: startDate,
            predict: (date) => {
                const daysSince = (new Date(date) - startDate) / (1000 * 60 * 60 * 24);
                const logPrice = 0.0005 * daysSince + 2.5;
                return Math.pow(10, logPrice);
            }
        };
    }

    const regressionData = historicalData.map(d => {
        const daysSince = (new Date(d.date) - startDate) / (1000 * 60 * 60 * 24);
        return [daysSince, Math.log10(d.price || d.mnavAdjustedPrice)];
    });

    const result = regression.linear(regressionData);

    return {
        equation: result.equation,
        firstDate: startDate,
        predict: (date) => {
            const daysSince = (new Date(date) - startDate) / (1000 * 60 * 60 * 24);
            const logPrice = result.equation[0] * daysSince + result.equation[1];
            return Math.pow(10, logPrice);
        }
    };
}

function generateRainbowBands(data, regression) {
    const config = presetConfigs[currentPreset];
    const bandCount = config.bandCount;
    const bandWidth = config.bandWidth;

    const bands = [];
    const dates = data.map(d => d.date);

    // Generate band offsets based on configuration
    const bandOffsets = [];
    for (let i = 0; i < bandCount; i++) {
        const offset = -bandWidth * (bandCount - 1) / 2 + i * bandWidth;
        bandOffsets.push(offset);
    }

    for (let i = 0; i < bandOffsets.length; i++) {
        const bandData = dates.map(date => {
            const daysSince = (new Date(date) - regression.firstDate) / (1000 * 60 * 60 * 24);
            const logPrice = regression.equation[0] * daysSince + regression.equation[1] + bandOffsets[i];
            return Math.pow(10, logPrice);
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

function createChart() {
    const ctx = document.getElementById('rainbowChart').getContext('2d');

    // Calculate regressions (always use preset values)
    const btcRegression = calculateRegression(btcData, true);
    const mnavRegression = calculateRegression(mnavData.map(d => ({
        date: d.date,
        price: d.mnavAdjustedPrice
    })), true);

    // Generate rainbow bands
    const btcRainbowBands = generateRainbowBands(btcData, btcRegression);
    const mnavRainbowBands = generateRainbowBands(mnavData, mnavRegression);

    // Create aligned data for MSTR MNAV (with null values before 2022)
    const mnavAlignedData = btcData.map(btcItem => {
        const mnavItem = mnavData.find(m => m.date === btcItem.date);
        return mnavItem ? mnavItem.mnavAdjustedPrice : null;
    });

    // Create halving annotations
    const halvingAnnotations = {};
    halvingDates.forEach((halving, index) => {
        halvingAnnotations[`halving${index}`] = {
            type: 'line',
            borderColor: 'rgba(255, 255, 255, 0.8)',
            borderWidth: 2,
            borderDash: [5, 5],
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

    // Generate regression line data
    const btcRegressionLine = btcData.map(d => btcRegression.predict(d.date));
    const mnavRegressionLine = btcData.map(d => {
        const mnavItem = mnavData.find(m => m.date === d.date);
        return mnavItem ? mnavRegression.predict(d.date) : null;
    });

    const datasets = [
        // BTC Spot Price
        {
            label: 'BTC Spot Price',
            data: btcData.map(d => d.price),
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
        },
        // BTC Regression Line
        {
            label: 'BTC Trend Line',
            data: btcRegressionLine,
            borderColor: 'rgba(255, 159, 64, 0.5)',
            borderWidth: 2,
            borderDash: [10, 5],
            fill: false,
            pointRadius: 0,
            tension: 0,
            order: 3,
            spanGaps: false
        },
        // MNAV Regression Line
        {
            label: 'MNAV Trend Line',
            data: mnavRegressionLine,
            borderColor: 'rgba(153, 102, 255, 0.5)',
            borderWidth: 2,
            borderDash: [10, 5],
            fill: false,
            pointRadius: 0,
            tension: 0,
            order: 4,
            spanGaps: false
        }
    ];

    // Add rainbow bands
    btcRainbowBands.forEach(band => {
        band.hidden = false;
        datasets.push(band);
    });

    // Align MNAV rainbow bands with BTC dates (null before 2022)
    mnavRainbowBands.forEach((band, idx) => {
        const alignedData = btcData.map(btcItem => {
            const mnavIndex = mnavData.findIndex(m => m.date === btcItem.date);
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
            labels: btcData.map(d => d.date),
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

    // Preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            currentPreset = this.dataset.preset;

            // Show/hide custom controls
            const customControls = document.getElementById('customControls');
            if (currentPreset === 'custom') {
                customControls.style.display = 'block';
                updateCustomValues();
            } else {
                customControls.style.display = 'none';
            }

            rebuildChart();
        });
    });

    // Track pending changes
    let pendingCustomSettings = { ...customSettings };

    // Custom sliders - only update display values
    document.getElementById('slopeSlider').addEventListener('input', function() {
        pendingCustomSettings.slope = parseFloat(this.value);
        document.getElementById('slopeValue').textContent = this.value;
        if (currentPreset === 'custom') {
            showPendingChanges();
        }
    });

    document.getElementById('interceptSlider').addEventListener('input', function() {
        pendingCustomSettings.intercept = parseFloat(this.value);
        document.getElementById('interceptValue').textContent = this.value;
        if (currentPreset === 'custom') {
            showPendingChanges();
        }
    });

    document.getElementById('bandWidthSlider').addEventListener('input', function() {
        pendingCustomSettings.bandWidth = parseFloat(this.value);
        document.getElementById('bandWidthValue').textContent = this.value;
        if (currentPreset === 'custom') {
            showPendingChanges();
        }
    });

    document.getElementById('bandCountSlider').addEventListener('input', function() {
        pendingCustomSettings.bandCount = parseInt(this.value);
        document.getElementById('bandCountValue').textContent = this.value;
        if (currentPreset === 'custom') {
            showPendingChanges();
        }
    });

    // Recompute button
    document.getElementById('recomputeBtn').addEventListener('click', function() {
        if (currentPreset === 'custom') {
            customSettings = { ...pendingCustomSettings };
            presetConfigs.custom = customSettings;
            rebuildChart();
            hidePendingChanges();
        }
    });
}

function showPendingChanges() {
    const indicator = document.getElementById('pendingChanges');
    if (indicator) indicator.style.display = 'inline';
}

function hidePendingChanges() {
    const indicator = document.getElementById('pendingChanges');
    if (indicator) indicator.style.display = 'none';
}

function updateCustomValues() {
    document.getElementById('slopeSlider').value = customSettings.slope;
    document.getElementById('slopeValue').textContent = customSettings.slope;
    document.getElementById('interceptSlider').value = customSettings.intercept;
    document.getElementById('interceptValue').textContent = customSettings.intercept;
    document.getElementById('bandWidthSlider').value = customSettings.bandWidth;
    document.getElementById('bandWidthValue').textContent = customSettings.bandWidth;
    document.getElementById('bandCountSlider').value = customSettings.bandCount;
    document.getElementById('bandCountValue').textContent = customSettings.bandCount;
    // Reset pending settings when updating
    pendingCustomSettings = { ...customSettings };
    hidePendingChanges();
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