let chart = null;
let btcData = [];
let mnavData = [];
let strData = {};
let extendedDates = [];

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
    // Handle both hex and rgb formats
    if (hex.startsWith('rgb')) {
        // Extract RGB values from rgb(r, g, b) format
        const matches = hex.match(/\d+/g);
        if (matches && matches.length >= 3) {
            return `rgba(${matches[0]}, ${matches[1]}, ${matches[2]}, ${alpha})`;
        }
    }
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

// Rainbow color spectrum for smooth transitions
// Starts at Red right after each halving
const rainbowSpectrum = [
    { r: 255, g: 0, b: 0 },      // Red - at halving
    { r: 255, g: 127, b: 0 },    // Orange
    { r: 255, g: 255, b: 0 },    // Yellow
    { r: 0, g: 255, b: 0 },      // Green
    { r: 0, g: 0, b: 255 },      // Blue
    { r: 75, g: 0, b: 130 },     // Indigo
    { r: 148, g: 0, b: 211 },    // Violet
    { r: 255, g: 0, b: 0 }       // Red - returns to red at next halving
];

// Interpolate between two colors
function interpolateColor(color1, color2, factor) {
    const r = Math.round(color1.r + (color2.r - color1.r) * factor);
    const g = Math.round(color1.g + (color2.g - color1.g) * factor);
    const b = Math.round(color1.b + (color2.b - color1.b) * factor);
    return `rgb(${r}, ${g}, ${b})`;
}

// Function to get rainbow color for a specific date based on halving cycle
function getHalvingColor(dateStr) {
    const date = new Date(dateStr);

    // Find which halving period we're in
    let startDate, endDate, periodIndex;

    // Before first halving - genesis era
    if (date < new Date(halvingDates[0].date)) {
        startDate = new Date('2009-01-03'); // Bitcoin genesis block
        endDate = new Date(halvingDates[0].date);
        periodIndex = 0;
    } else {
        // Find the halving period
        for (let i = 0; i < halvingDates.length - 1; i++) {
            if (date >= new Date(halvingDates[i].date) && date < new Date(halvingDates[i + 1].date)) {
                startDate = new Date(halvingDates[i].date);
                endDate = new Date(halvingDates[i + 1].date);
                periodIndex = i + 1;
                break;
            }
        }

        // After last known halving
        if (!startDate && date >= new Date(halvingDates[halvingDates.length - 1].date)) {
            startDate = new Date(halvingDates[halvingDates.length - 1].date);
            // Estimate next halving ~4 years later
            endDate = new Date(startDate);
            endDate.setFullYear(endDate.getFullYear() + 4);
            periodIndex = halvingDates.length;
        }
    }

    if (!startDate || !endDate) {
        return 'rgb(255, 159, 64)'; // Default orange
    }

    // Calculate progress through the halving period (0 to 1)
    const totalTime = endDate - startDate;
    const elapsed = date - startDate;
    const progress = Math.max(0, Math.min(1, elapsed / totalTime));

    // FULL RAINBOW CYCLE for each halving period
    // Progress from 0 to 1 maps to full spectrum
    const spectrumLength = rainbowSpectrum.length;
    const colorIdx = progress * (spectrumLength - 1);

    // Interpolate between adjacent colors in spectrum
    const baseIdx = Math.floor(colorIdx);
    const nextIdx = Math.min(baseIdx + 1, spectrumLength - 1);
    const factor = colorIdx - baseIdx;

    return interpolateColor(rainbowSpectrum[baseIdx], rainbowSpectrum[nextIdx], factor);
}

// Function to create segmented dataset for halving-based coloring
function createHalvingSegmentedDataset(data, label) {
    const segments = [];
    const segmentSize = 5; // Smaller segments for smoother color transitions
    let currentSegment = [];
    let currentSegmentIndices = [];

    data.forEach((point, index) => {
        if (point === null) {
            // When we hit a null, save the current segment if it has data
            if (currentSegment.length > 0) {
                // Use the last data point's date for the segment color
                const colorIndex = currentSegmentIndices[currentSegmentIndices.length - 1];
                const date = extendedDates[colorIndex];
                const color = getHalvingColor(date);

                segments.push({
                    data: [...currentSegment],
                    color: color,
                    startIdx: currentSegmentIndices[0],
                    indices: [...currentSegmentIndices]
                });

                currentSegment = [];
                currentSegmentIndices = [];
            }
            return;
        }

        currentSegment.push(point);
        currentSegmentIndices.push(index);

        // Create a new segment every segmentSize points or at the end
        if (currentSegment.length >= segmentSize || index === data.length - 1) {
            // Use the last data point's date for the segment color for smoother progression
            const colorIndex = currentSegmentIndices[currentSegmentIndices.length - 1];
            const date = extendedDates[colorIndex];
            const color = getHalvingColor(date);

            segments.push({
                data: [...currentSegment],
                color: color,
                startIdx: currentSegmentIndices[0],
                indices: [...currentSegmentIndices]
            });

            // Start new segment with overlap point for smooth transition
            if (index < data.length - 1 && currentSegment.length > 0) {
                currentSegment = [currentSegment[currentSegment.length - 1]];
                currentSegmentIndices = [currentSegmentIndices[currentSegmentIndices.length - 1]];
            } else {
                currentSegment = [];
                currentSegmentIndices = [];
            }
        }
    });

    // Convert segments to datasets with gradient effect
    const datasets = [];

    segments.forEach((segment, i) => {
        const segmentData = new Array(extendedDates.length).fill(null);

        // Fill in the data for this segment's range using stored indices
        for (let j = 0; j < segment.data.length; j++) {
            const idx = segment.indices ? segment.indices[j] : (segment.startIdx + j);
            if (idx >= 0 && idx < segmentData.length) {
                segmentData[idx] = segment.data[j];
            }
        }

        datasets.push({
            label: i === 0 ? label : '', // Only show label for first segment
            data: segmentData,
            borderColor: segment.color,
            backgroundColor: hexToRgba(segment.color, 0.1),
            borderWidth: 3,
            fill: false,
            pointRadius: 0,
            tension: 0.1, // Add slight tension for smoother curves
            order: 1,
            spanGaps: true // Allow spanning small gaps between segments
        });
    });

    return datasets;
}

async function loadData() {
    // Use data from data.js
    btcData = btcHistoricalData;
    mnavData = mnavHistoricalData;
    strData = typeof strHistoricalData !== 'undefined' ? strHistoricalData : {};

    createChart();
    updateStats();
}

/**
 * Generate cycle overlay data aligned by days since halving
 * Maps historical cycle data to current chart dates based on days from halving
 * @param {number} cycleIndex - Index of the cycle to overlay (0-2 for 1st-3rd halving)
 * @param {Array} chartDates - Array of dates currently displayed on chart
 * @returns {Object} Object with date->price mapping for overlay
 */
function generateCycleOverlay(cycleIndex, chartDates) {
    const cycleHalving = halvingDates[cycleIndex];
    const currentHalving = halvingDates[3]; // 4th halving (2024-04-20)
    const nextCycleHalving = halvingDates[cycleIndex + 1];

    if (!cycleHalving || !currentHalving || !nextCycleHalving) return {};

    const cycleStart = new Date(cycleHalving.date);
    const currentHalvingDate = new Date(currentHalving.date);

    // Find BTC price at the historical cycle's halving date
    const cycleHalvingData = btcData.find(d => d.date === cycleHalving.date) ||
                             btcData.find(d => new Date(d.date) >= cycleStart);
    if (!cycleHalvingData) return {};
    const cycleStartPrice = cycleHalvingData.price;

    // Find BTC price at the current (4th) halving date
    const currentHalvingData = btcData.find(d => d.date === currentHalving.date) ||
                               btcData.find(d => new Date(d.date) >= currentHalvingDate);
    if (!currentHalvingData) return {};
    const currentStartPrice = currentHalvingData.price;

    // Create a map of aligned dates to prices
    const overlayMap = {};

    // For each date in the chart, calculate the equivalent historical date
    chartDates.forEach(chartDate => {
        const currentDate = new Date(chartDate);
        // Days from current halving (can be negative if before halving)
        const daysFromCurrentHalving = Math.floor((currentDate - currentHalvingDate) / (1000 * 60 * 60 * 24));

        // Calculate equivalent date in historical cycle
        const historicalDate = new Date(cycleStart);
        historicalDate.setDate(historicalDate.getDate() + daysFromCurrentHalving);
        const historicalDateStr = historicalDate.toISOString().split('T')[0];

        // Find historical BTC price for that date (or nearest date within 7 days)
        let historicalData = btcData.find(d => d.date === historicalDateStr);

        // If exact match not found, search for nearest date within +/- 7 days
        if (!historicalData) {
            const targetDate = new Date(historicalDateStr);
            let closestData = null;
            let minDiff = Infinity;

            btcData.forEach(d => {
                const dataDate = new Date(d.date);
                const diff = Math.abs(dataDate - targetDate);
                const daysDiff = diff / (1000 * 60 * 60 * 24);

                // Only consider dates within 7 days
                if (daysDiff <= 7 && diff < minDiff) {
                    minDiff = diff;
                    closestData = d;
                }
            });

            historicalData = closestData;
        }

        if (historicalData && historicalData.price > 0) {
            // Normalize price: scale historical cycle to start at current cycle's halving price
            const normalizedPrice = (historicalData.price / cycleStartPrice) * currentStartPrice;
            overlayMap[chartDate] = normalizedPrice;
        }
    });

    return overlayMap;
}

function generateExtendedDates(dates, months = 0) {
    // No extension - just return the actual dates
    return [...dates];
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

// Create function to calculate custom MNAV based on selected components
function calculateCustomMnav(date, includeDebt, includeSTRC, includeSTRD, includeSTRF, includeSTRK) {
    const mnavItem = mnavData.find(m => m.date === date);
    if (!mnavItem || !mnavItem.btcNav) return null;

    let enterpriseValue = mnavItem.marketCap || 0;

    if (includeDebt) {
        enterpriseValue += mnavItem.debt || 0;
    }

    // Add individual STR components
    if (includeSTRC && strData.STRC) {
        const strItem = strData.STRC.find(s => s.date === date);
        if (strItem) enterpriseValue += strItem.notional || 0;
    }
    if (includeSTRD && strData.STRD) {
        const strItem = strData.STRD.find(s => s.date === date);
        if (strItem) enterpriseValue += strItem.notional || 0;
    }
    if (includeSTRF && strData.STRF) {
        const strItem = strData.STRF.find(s => s.date === date);
        if (strItem) enterpriseValue += strItem.notional || 0;
    }
    if (includeSTRK && strData.STRK) {
        const strItem = strData.STRK.find(s => s.date === date);
        if (strItem) enterpriseValue += strItem.notional || 0;
    }

    const mnav = enterpriseValue / mnavItem.btcNav;
    return mnav * mnavItem.spotPrice;
}

function createChart() {
    const ctx = document.getElementById('rainbowChart').getContext('2d');

    // Build date axis from actual data
    const baseDates = btcData.map(d => d.date);
    extendedDates = generateExtendedDates(baseDates);

    // Compute model baselines (center) from fitted reference equations
    const btcBaseline = computeModelSeries(extendedDates.length, typeof rainbowModelBTC !== 'undefined' ? rainbowModelBTC : null);

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

    // Create aligned data for naive MSTR MNAV
    const naiveMnavAlignedData = extendedDates.map(date => {
        const mnavItem = mnavData.find(m => m.date === date);
        return mnavItem ? mnavItem.naiveMnavAdjustedPrice : null;
    });

    // Create data for debt-only MNAV
    const debtOnlyMnavData = extendedDates.map(date => {
        return calculateCustomMnav(date, true, false, false, false, false);
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

    // Prepare BTC spot data
    const btcSpotData = extendedDates.map(date => {
        const item = btcData.find(d => d.date === date);
        return item ? item.price : null; // no future price
    });

    // Create datasets with halving-based rainbow coloring
    let btcDatasets = createHalvingSegmentedDataset(btcSpotData, 'BTC Spot Price');

    // Calculate initial custom MNAV data with all components enabled
    const initialCustomData = extendedDates.map(date => {
        return calculateCustomMnav(date, true, true, true, true, true);
    });

    const datasets = [
        ...btcDatasets,
        // MSTR Naive MNAV (Market Cap only)
        {
            label: 'MSTR Naive MNAV',
            data: naiveMnavAlignedData,
            borderColor: 'rgba(153, 102, 255, 0.5)',
            backgroundColor: 'rgba(153, 102, 255, 0.05)',
            borderWidth: 2,
            borderDash: [5, 5],  // Dashed line for naive
            fill: false,
            pointRadius: 0,
            tension: 0.2,
            order: 2,
            spanGaps: true
        },
        // Custom MNAV (dynamically calculated)
        {
            label: 'Custom MNAV',
            data: initialCustomData, // Start with all components enabled
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.1)',
            borderWidth: 2,
            fill: false,
            pointRadius: 0,
            tension: 0.2,
            order: 3,
            spanGaps: true
        }
    ];

    // Add rainbow bands
    btcRainbowBands.forEach(band => {
        band.hidden = false;
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
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            // Check if this is a BTC spot segment (order === 1)
                            if (context.dataset.order === 1) {
                                let label = 'BTC Spot Price: $';
                                if (context.parsed.y !== null) {
                                    label += context.parsed.y.toLocaleString('en-US', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                    });
                                }
                                return label;
                            }

                            // Skip datasets with empty labels (rainbow bands)
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

    // Store original BTC data for toggle switching
    chart.btcSpotData = btcSpotData;
}

function setupToggles() {
    document.getElementById('showSpot').addEventListener('change', function(e) {
        // Handle multiple BTC datasets (rainbow segments)
        // Find all BTC datasets by checking order = 1
        chart.data.datasets.forEach(ds => {
            if (ds.order === 1) {
                ds.hidden = !e.target.checked;
            }
        });
        chart.update();
    });

    document.getElementById('showNaiveMNAV').addEventListener('change', function(e) {
        // Find Naive MNAV dataset by label
        const naiveDataset = chart.data.datasets.find(ds => ds.label === 'MSTR Naive MNAV');
        if (naiveDataset) {
            naiveDataset.hidden = !e.target.checked;
        }
        chart.update();
    });

    document.getElementById('showCustomMNAV').addEventListener('change', function(e) {
        // Find Custom MNAV dataset by label
        const customDataset = chart.data.datasets.find(ds => ds.label === 'Custom MNAV');
        if (customDataset) {
            customDataset.hidden = !e.target.checked;
        }
        chart.update();
    });

    // Function to update custom MNAV based on selected components
    function updateCustomMNAV() {
        const includeDebt = document.getElementById('includeDebt').checked;
        const includeSTRC = document.getElementById('includeSTRC').checked;
        const includeSTRD = document.getElementById('includeSTRD').checked;
        const includeSTRF = document.getElementById('includeSTRF').checked;
        const includeSTRK = document.getElementById('includeSTRK').checked;

        const customData = extendedDates.map(date => {
            return calculateCustomMnav(date, includeDebt, includeSTRC, includeSTRD, includeSTRF, includeSTRK);
        });

        // Find Custom MNAV dataset by label and update its data
        const customDataset = chart.data.datasets.find(ds => ds.label === 'Custom MNAV');
        if (customDataset) {
            customDataset.data = customData;
        }
        chart.update();
    }

    // Add event listeners for component checkboxes
    ['includeDebt', 'includeSTRC', 'includeSTRD', 'includeSTRF', 'includeSTRK'].forEach(id => {
        document.getElementById(id).addEventListener('change', updateCustomMNAV);
    });

    // Initialize custom MNAV with current checkbox state
    updateCustomMNAV();

    // Function to update cycle overlays
    // All cycles are aligned to the 4th halving (2024-04-20) by days since halving
    function updateCycleOverlays() {
        const showCycle1 = document.getElementById('showCycle1').checked;
        const showCycle2 = document.getElementById('showCycle2').checked;
        const showCycle3 = document.getElementById('showCycle3').checked;

        // Remove existing overlay datasets
        chart.data.datasets = chart.data.datasets.filter(ds => !ds.isCycleOverlay);

        // Get the currently visible date range from the chart
        const xScale = chart.scales.x;
        const minDate = xScale.min ? new Date(xScale.min) : new Date(extendedDates[0]);
        const maxDate = xScale.max ? new Date(xScale.max) : new Date(extendedDates[extendedDates.length - 1]);

        // Filter to only dates visible in current zoom
        const visibleDates = extendedDates.filter(date => {
            const d = new Date(date);
            return d >= minDate && d <= maxDate;
        });

        console.log(`Visible date range: ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]} (${visibleDates.length} dates)`);

        // Add new overlay datasets if checked
        const overlays = [
            { index: 0, show: showCycle1, label: '1st Cycle (2012)', color: 'rgb(255, 140, 0)' },
            { index: 1, show: showCycle2, label: '2nd Cycle (2016)', color: 'rgb(255, 215, 0)' },
            { index: 2, show: showCycle3, label: '3rd Cycle (2020)', color: 'rgb(0, 206, 209)' }
        ];

        overlays.forEach(overlay => {
            if (overlay.show) {
                const overlayMap = generateCycleOverlay(overlay.index, visibleDates);

                // Map overlay data to chart dates using the date map
                const mappedData = extendedDates.map(date => {
                    return overlayMap[date] || null;
                });

                // Count non-null values and show date range for debugging
                const nonNullCount = mappedData.filter(v => v !== null).length;
                const firstNonNull = visibleDates.find(date => overlayMap[date] !== undefined);
                const lastNonNull = visibleDates.slice().reverse().find(date => overlayMap[date] !== undefined);

                const currentHalving = new Date(halvingDates[3].date);
                const historicalHalving = new Date(halvingDates[overlay.index].date);

                if (firstNonNull && lastNonNull) {
                    const firstDate = new Date(firstNonNull);
                    const lastDate = new Date(lastNonNull);
                    const firstDays = Math.floor((firstDate - currentHalving) / (1000 * 60 * 60 * 24));
                    const lastDays = Math.floor((lastDate - currentHalving) / (1000 * 60 * 60 * 24));

                    const histFirstDate = new Date(historicalHalving);
                    histFirstDate.setDate(histFirstDate.getDate() + firstDays);
                    const histLastDate = new Date(historicalHalving);
                    histLastDate.setDate(histLastDate.getDate() + lastDays);

                    console.log(`${overlay.label}: ${nonNullCount} points | Chart: ${firstNonNull} to ${lastNonNull} (${firstDays} to ${lastDays} days from halving) | Historical: ${histFirstDate.toISOString().split('T')[0]} to ${histLastDate.toISOString().split('T')[0]}`);
                } else {
                    console.log(`${overlay.label}: ${nonNullCount} data points mapped`);
                }

                chart.data.datasets.push({
                    label: overlay.label,
                    data: mappedData,
                    borderColor: overlay.color,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [8, 4],
                    fill: false,
                    pointRadius: 0,
                    tension: 0.2,
                    order: 4,
                    spanGaps: true,
                    isCycleOverlay: true
                });
            }
        });

        chart.update();
    }

    // Add event listeners for cycle overlay controls
    document.getElementById('showCycle1').addEventListener('change', updateCycleOverlays);
    document.getElementById('showCycle2').addEventListener('change', updateCycleOverlays);
    document.getElementById('showCycle3').addEventListener('change', updateCycleOverlays);

    document.getElementById('showSpotRainbow').addEventListener('change', function(e) {
        // Hide/show all rainbow band datasets (order >= 10)
        chart.data.datasets.forEach(ds => {
            if (ds.order >= 10) {
                ds.hidden = !e.target.checked;
            }
        });
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
    document.querySelectorAll('.zoom-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            if (!chart) {
                console.error('Chart not initialized');
                return;
            }

            document.querySelectorAll('.zoom-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const range = this.dataset.range;
            const today = new Date();
            let minDate = null;
            let maxDate = today; // Default to today to avoid showing future data

            // Calculate halving-based ranges
            // Average time between halvings is ~4 years (1460 days)
            const daysPerHalving = 1460;

            switch(range) {
                case '1.5H': // 1.5 halvings = ~6 years
                    minDate = new Date(today);
                    minDate.setDate(minDate.getDate() - (1.5 * daysPerHalving));
                    break;
                case '2.5H': // 2.5 halvings = ~10 years
                    minDate = new Date(today);
                    minDate.setDate(minDate.getDate() - (2.5 * daysPerHalving));
                    break;
                case '3.5H': // 3.5 halvings = ~14 years
                    minDate = new Date(today);
                    minDate.setDate(minDate.getDate() - (3.5 * daysPerHalving));
                    break;
                case 'ALL':
                default:
                    minDate = null;
                    maxDate = null; // Show all data including future for ALL
            }

            if (minDate) {
                chart.options.scales.x.min = minDate.toISOString().split('T')[0];
            } else {
                chart.options.scales.x.min = undefined;
            }

            if (maxDate) {
                chart.options.scales.x.max = maxDate.toISOString().split('T')[0];
            } else {
                chart.options.scales.x.max = undefined;
            }

            // Show cycle overlay controls only on 1.5H zoom
            const cycleControls = document.getElementById('cycleOverlayControls');
            if (range === '1.5H') {
                cycleControls.style.display = 'block';
                updateCycleOverlays(); // Initialize overlays
            } else {
                cycleControls.style.display = 'none';
                // Remove overlay datasets when leaving 1.5H view
                chart.data.datasets = chart.data.datasets.filter(ds => !ds.isCycleOverlay);
            }

            chart.update('none'); // Use 'none' mode for immediate update
        });
    });

}

function updateStats() {
    const latestBTC = btcData[btcData.length - 1];
    const latestMNAV = mnavData[mnavData.length - 1];

    // Calculate custom MNAV for stats
    const customMnav = calculateCustomMnav(latestMNAV.date, true, true, true, true, true);
    const customMnavPercent = customMnav ? (customMnav / latestBTC.price * 100).toFixed(1) : 'N/A';

    const statsHTML = `
        <div class="stat-card">
            <h3>Latest BTC Spot Price</h3>
            <p>$${latestBTC.price.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
        </div>
        <div class="stat-card">
            <h3>Naive MNAV</h3>
            <p>${((latestMNAV.naiveMnav || 1) * 100).toFixed(1)}%</p>
        </div>
        <div class="stat-card">
            <h3>Custom MNAV</h3>
            <p>${customMnavPercent}%</p>
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
