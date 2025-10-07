let chart = null;
let btcData = [];
let mnavData = [];
let currentPreset = 'default';
let customSettings = {
    slope: 0.00063,
    intercept: 1.85,
    bandWidth: 0.39,
    bandCount: 9
};
let pendingCustomSettings = { ...customSettings };

// Preset configurations - these values are tuned for Bitcoin's actual price history
const presetConfigs = {
    default: {
        slope: null, // Will be calculated from data
        intercept: null,
        bandWidth: 0.35,
        bandCount: 9,
        startYear: 2014 // Start from when we have good data
    },
    classic: {
        // Classic rainbow chart parameters (tuned to match historical cycles)
        // Price should oscillate through all bands over market cycles
        slope: 0.000631,  // Steeper slope for long-term growth
        intercept: 1.85,  // Much lower intercept to center the bands
        bandWidth: 0.39,  // Wider bands to capture volatility
        bandCount: 9,
        startYear: 2011  // Start from early Bitcoin data
    },
    conservative: {
        // More conservative growth expectation
        slope: 0.00055,
        intercept: 2.0,
        bandWidth: 0.32,
        bandCount: 9,
        startYear: 2012
    },
    aggressive: {
        // More aggressive growth expectation
        slope: 0.00070,
        intercept: 1.7,
        bandWidth: 0.42,
        bandCount: 9,
        startYear: 2011
    },
    halving: {
        // Adjusted for halving cycles
        slope: 0.00062,
        intercept: 1.9,
        bandWidth: 0.38,
        bandCount: 10,
        startYear: 2012
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
    // Embedded data
    btcData = [{"date": "2014-09-01", "price": 386.9440002441406}, {"date": "2014-10-01", "price": 338.3210144042969}, {"date": "2014-11-01", "price": 378.0469970703125}, {"date": "2014-12-01", "price": 320.1929931640625}, {"date": "2015-01-01", "price": 217.46400451660156}, {"date": "2015-02-01", "price": 254.26300048828125}, {"date": "2015-03-01", "price": 244.2239990234375}, {"date": "2015-04-01", "price": 236.14500427246094}, {"date": "2015-05-01", "price": 230.19000244140625}, {"date": "2015-06-01", "price": 263.0719909667969}, {"date": "2015-07-01", "price": 284.6499938964844}, {"date": "2015-08-01", "price": 230.05599975585938}, {"date": "2015-09-01", "price": 236.05999755859375}, {"date": "2015-10-01", "price": 314.1659851074219}, {"date": "2015-11-01", "price": 377.3210144042969}, {"date": "2015-12-01", "price": 430.5669860839844}, {"date": "2016-01-01", "price": 368.7669982910156}, {"date": "2016-02-01", "price": 437.6969909667969}, {"date": "2016-03-01", "price": 416.72900390625}, {"date": "2016-04-01", "price": 448.3179931640625}, {"date": "2016-05-01", "price": 531.385986328125}, {"date": "2016-06-01", "price": 673.3369750976562}, {"date": "2016-07-01", "price": 624.6810302734375}, {"date": "2016-08-01", "price": 575.4719848632812}, {"date": "2016-09-01", "price": 609.7349853515625}, {"date": "2016-10-01", "price": 700.9719848632812}, {"date": "2016-11-01", "price": 745.6909790039062}, {"date": "2016-12-01", "price": 963.7429809570312}, {"date": "2017-01-01", "price": 970.4030151367188}, {"date": "2017-02-01", "price": 1179.969970703125}, {"date": "2017-03-01", "price": 1071.7900390625}, {"date": "2017-04-01", "price": 1347.8900146484375}, {"date": "2017-05-01", "price": 2286.409912109375}, {"date": "2017-06-01", "price": 2480.840087890625}, {"date": "2017-07-01", "price": 2875.340087890625}, {"date": "2017-08-01", "price": 4703.39013671875}, {"date": "2017-09-01", "price": 4338.7099609375}, {"date": "2017-10-01", "price": 6468.39990234375}, {"date": "2017-11-01", "price": 10233.599609375}, {"date": "2017-12-01", "price": 14156.400390625}, {"date": "2018-01-01", "price": 10221.099609375}, {"date": "2018-02-01", "price": 10397.900390625}, {"date": "2018-03-01", "price": 6973.52978515625}, {"date": "2018-04-01", "price": 9240.5498046875}, {"date": "2018-05-01", "price": 7494.169921875}, {"date": "2018-06-01", "price": 6404.0}, {"date": "2018-07-01", "price": 7780.43994140625}, {"date": "2018-08-01", "price": 7037.580078125}, {"date": "2018-09-01", "price": 6625.56005859375}, {"date": "2018-10-01", "price": 6317.60986328125}, {"date": "2018-11-01", "price": 4017.2685546875}, {"date": "2018-12-01", "price": 3742.700439453125}, {"date": "2019-01-01", "price": 3457.792724609375}, {"date": "2019-02-01", "price": 3854.785400390625}, {"date": "2019-03-01", "price": 4105.404296875}, {"date": "2019-04-01", "price": 5350.7265625}, {"date": "2019-05-01", "price": 8574.501953125}, {"date": "2019-06-01", "price": 10817.1552734375}, {"date": "2019-07-01", "price": 10085.6279296875}, {"date": "2019-08-01", "price": 9630.6640625}, {"date": "2019-09-01", "price": 8293.8681640625}, {"date": "2019-10-01", "price": 9199.5849609375}, {"date": "2019-11-01", "price": 7569.6298828125}, {"date": "2019-12-01", "price": 7193.59912109375}, {"date": "2020-01-01", "price": 9350.529296875}, {"date": "2020-02-01", "price": 8599.5087890625}, {"date": "2020-03-01", "price": 6438.64453125}, {"date": "2020-04-01", "price": 8658.5537109375}, {"date": "2020-05-01", "price": 9461.05859375}, {"date": "2020-06-01", "price": 9137.9931640625}, {"date": "2020-07-01", "price": 11323.466796875}, {"date": "2020-08-01", "price": 11680.8203125}, {"date": "2020-09-01", "price": 10784.4912109375}, {"date": "2020-10-01", "price": 13780.9951171875}, {"date": "2020-11-01", "price": 19625.8359375}, {"date": "2020-12-01", "price": 29001.720703125}, {"date": "2021-01-01", "price": 33114.359375}, {"date": "2021-02-01", "price": 45137.76953125}, {"date": "2021-03-01", "price": 58918.83203125}, {"date": "2021-04-01", "price": 57750.17578125}, {"date": "2021-05-01", "price": 37332.85546875}, {"date": "2021-06-01", "price": 35040.8359375}, {"date": "2021-07-01", "price": 41626.1953125}, {"date": "2021-08-01", "price": 47166.6875}, {"date": "2021-09-01", "price": 43790.89453125}, {"date": "2021-10-01", "price": 61318.95703125}, {"date": "2021-11-01", "price": 57005.42578125}, {"date": "2021-12-01", "price": 46306.4453125}, {"date": "2022-01-01", "price": 38483.125}, {"date": "2022-02-01", "price": 43193.234375}, {"date": "2022-03-01", "price": 45538.67578125}, {"date": "2022-04-01", "price": 37714.875}, {"date": "2022-05-01", "price": 31792.310546875}, {"date": "2022-06-01", "price": 19784.7265625}, {"date": "2022-07-01", "price": 23336.896484375}, {"date": "2022-08-01", "price": 20049.763671875}, {"date": "2022-09-01", "price": 19431.7890625}, {"date": "2022-10-01", "price": 20495.7734375}, {"date": "2022-11-01", "price": 17168.56640625}, {"date": "2022-12-01", "price": 16547.49609375}, {"date": "2023-01-01", "price": 23139.283203125}, {"date": "2023-02-01", "price": 23147.353515625}, {"date": "2023-03-01", "price": 28478.484375}, {"date": "2023-04-01", "price": 29268.806640625}, {"date": "2023-05-01", "price": 27219.658203125}, {"date": "2023-06-01", "price": 30477.251953125}, {"date": "2023-07-01", "price": 29230.111328125}, {"date": "2023-08-01", "price": 25931.47265625}, {"date": "2023-09-01", "price": 26967.916015625}, {"date": "2023-10-01", "price": 34667.78125}, {"date": "2023-11-01", "price": 37712.74609375}, {"date": "2023-12-01", "price": 42265.1875}, {"date": "2024-01-01", "price": 42582.60546875}, {"date": "2024-02-01", "price": 61198.3828125}, {"date": "2024-03-01", "price": 71333.6484375}, {"date": "2024-04-01", "price": 60636.85546875}, {"date": "2024-05-01", "price": 67491.4140625}, {"date": "2024-06-01", "price": 62678.29296875}, {"date": "2024-07-01", "price": 64619.25}, {"date": "2024-08-01", "price": 58969.8984375}, {"date": "2024-09-01", "price": 63329.5}, {"date": "2024-10-01", "price": 70215.1875}, {"date": "2024-11-01", "price": 96449.0546875}, {"date": "2024-12-01", "price": 93429.203125}, {"date": "2025-01-01", "price": 102405.0234375}, {"date": "2025-02-01", "price": 84373.0078125}, {"date": "2025-03-01", "price": 82548.9140625}, {"date": "2025-04-01", "price": 94207.3125}, {"date": "2025-05-01", "price": 104638.09375}, {"date": "2025-06-01", "price": 107135.3359375}, {"date": "2025-07-01", "price": 115758.203125}, {"date": "2025-08-01", "price": 108236.7109375}, {"date": "2025-09-01", "price": 114056.0859375}, {"date": "2025-10-01", "price": 123513.4765625}];

    mnavData = [{"date": "2022-01-01", "spotPrice": 38483.125, "mnav": 0.25, "mnavAdjustedPrice": 9596.08, "btcHoldings": 125051.0, "marketCap": 1200000000.0}, {"date": "2022-02-01", "spotPrice": 43193.234375, "mnav": 0.93, "mnavAdjustedPrice": 39983.69, "btcHoldings": 125051.0, "marketCap": 5000000000.0}, {"date": "2022-03-01", "spotPrice": 45538.67578125, "mnav": 0.96, "mnavAdjustedPrice": 43902.09, "btcHoldings": 125051.0, "marketCap": 5490000000.0}, {"date": "2022-04-01", "spotPrice": 37714.875, "mnav": 0.82, "mnavAdjustedPrice": 30955.44, "btcHoldings": 129218.0, "marketCap": 4000000000.0}, {"date": "2022-05-01", "spotPrice": 31792.310546875, "mnav": 0.73, "mnavAdjustedPrice": 23139.19, "btcHoldings": 129218.0, "marketCap": 2990000000.0}, {"date": "2022-06-01", "spotPrice": 19784.7265625, "mnav": 0.72, "mnavAdjustedPrice": 14341.01, "btcHoldings": 129698.0, "marketCap": 1860000000.0}, {"date": "2022-07-01", "spotPrice": 23336.896484375, "mnav": 1.07, "mnavAdjustedPrice": 24904.01, "btcHoldings": 129698.0, "marketCap": 3230000000.0}, {"date": "2022-08-01", "spotPrice": 20049.763671875, "mnav": 1.01, "mnavAdjustedPrice": 20200.77, "btcHoldings": 129698.0, "marketCap": 2620000000.0}, {"date": "2022-09-01", "spotPrice": 19431.7890625, "mnav": 0.95, "mnavAdjustedPrice": 18461.68, "btcHoldings": 129999.0, "marketCap": 2400000000.0}, {"date": "2022-10-01", "spotPrice": 20495.7734375, "mnav": 1.24, "mnavAdjustedPrice": 25384.81, "btcHoldings": 129999.0, "marketCap": 3300000000.0}, {"date": "2022-11-01", "spotPrice": 17168.56640625, "mnav": 1.0, "mnavAdjustedPrice": 17230.9, "btcHoldings": 129999.0, "marketCap": 2240000000.0}, {"date": "2022-12-01", "spotPrice": 16547.49609375, "mnav": 0.73, "mnavAdjustedPrice": 12075.47, "btcHoldings": 132500.0, "marketCap": 1600000000.0}, {"date": "2023-01-01", "spotPrice": 23139.283203125, "mnav": 0.97, "mnavAdjustedPrice": 22490.57, "btcHoldings": 132500.0, "marketCap": 2980000000.0}, {"date": "2023-02-01", "spotPrice": 23147.353515625, "mnav": 1.01, "mnavAdjustedPrice": 23396.23, "btcHoldings": 132500.0, "marketCap": 3100000000.0}, {"date": "2023-03-01", "spotPrice": 28478.484375, "mnav": 0.87, "mnavAdjustedPrice": 24900.15, "btcHoldings": 138955.0, "marketCap": 3460000000.0}, {"date": "2023-04-01", "spotPrice": 29268.806640625, "mnav": 1.07, "mnavAdjustedPrice": 31305.1, "btcHoldings": 138955.0, "marketCap": 4350000000.0}, {"date": "2023-05-01", "spotPrice": 27219.658203125, "mnav": 1.05, "mnavAdjustedPrice": 28571.43, "btcHoldings": 140000.0, "marketCap": 4000000000.0}, {"date": "2023-06-01", "spotPrice": 30477.251953125, "mnav": 0.98, "mnavAdjustedPrice": 29803.13, "btcHoldings": 152333.0, "marketCap": 4540000000.0}, {"date": "2023-07-01", "spotPrice": 29230.111328125, "mnav": 1.4, "mnavAdjustedPrice": 40897.24, "btcHoldings": 152333.0, "marketCap": 6230000000.0}, {"date": "2023-08-01", "spotPrice": 25931.47265625, "mnav": 1.28, "mnavAdjustedPrice": 33246.07, "btcHoldings": 152800.0, "marketCap": 5080000000.0}, {"date": "2023-09-01", "spotPrice": 26967.916015625, "mnav": 1.09, "mnavAdjustedPrice": 29511.2, "btcHoldings": 158245.0, "marketCap": 4670000000.0}, {"date": "2023-10-01", "spotPrice": 34667.78125, "mnav": 1.06, "mnavAdjustedPrice": 36588.83, "btcHoldings": 158245.0, "marketCap": 5790000000.0}, {"date": "2023-11-01", "spotPrice": 37712.74609375, "mnav": 1.03, "mnavAdjustedPrice": 39019.08, "btcHoldings": 174530.0, "marketCap": 6810000000.0}, {"date": "2023-12-01", "spotPrice": 42265.1875, "mnav": 1.08, "mnavAdjustedPrice": 45625.17, "btcHoldings": 189150.0, "marketCap": 8630000000.0}, {"date": "2024-01-01", "spotPrice": 42582.60546875, "mnav": 1.07, "mnavAdjustedPrice": 45572.3, "btcHoldings": 189150.0, "marketCap": 8620000000.0}, {"date": "2024-02-01", "spotPrice": 61198.3828125, "mnav": 1.49, "mnavAdjustedPrice": 91139.9, "btcHoldings": 193000.0, "marketCap": 17590000000.0}, {"date": "2024-03-01", "spotPrice": 71333.6484375, "mnav": 1.92, "mnavAdjustedPrice": 136805.99, "btcHoldings": 214245.0, "marketCap": 29310000000.0}, {"date": "2024-04-01", "spotPrice": 60636.85546875, "mnav": 1.46, "mnavAdjustedPrice": 88712.69, "btcHoldings": 214400.0, "marketCap": 19020000000.0}, {"date": "2024-05-01", "spotPrice": 67491.4140625, "mnav": 1.88, "mnavAdjustedPrice": 127005.6, "btcHoldings": 214400.0, "marketCap": 27230000000.0}, {"date": "2024-06-01", "spotPrice": 62678.29296875, "mnav": 1.73, "mnavAdjustedPrice": 108690.37, "btcHoldings": 226331.0, "marketCap": 24600000000.0}, {"date": "2024-07-01", "spotPrice": 64619.25, "mnav": 2.18, "mnavAdjustedPrice": 140618.1, "btcHoldings": 226500.0, "marketCap": 31850000000.0}, {"date": "2024-08-01", "spotPrice": 58969.8984375, "mnav": 1.96, "mnavAdjustedPrice": 115320.09, "btcHoldings": 226500.0, "marketCap": 26120000000.0}, {"date": "2024-09-01", "spotPrice": 63329.5, "mnav": 2.08, "mnavAdjustedPrice": 131869.0, "btcHoldings": 252220.0, "marketCap": 33260000000.0}, {"date": "2024-10-01", "spotPrice": 70215.1875, "mnav": 2.66, "mnavAdjustedPrice": 186662.44, "btcHoldings": 252220.0, "marketCap": 47080000000.0}, {"date": "2024-11-01", "spotPrice": 96449.0546875, "mnav": 2.0, "mnavAdjustedPrice": 192940.26, "btcHoldings": 386700.0, "marketCap": 74610000000.0}, {"date": "2024-12-01", "spotPrice": 93429.203125, "mnav": 1.34, "mnavAdjustedPrice": 124932.8, "btcHoldings": 446400.0, "marketCap": 55770000000.0}, {"date": "2025-01-01", "spotPrice": 102405.0234375, "mnav": 1.78, "mnavAdjustedPrice": 182251.59, "btcHoldings": 471107.0, "marketCap": 85860000000.0}, {"date": "2025-02-01", "spotPrice": 84373.0078125, "mnav": 1.56, "mnavAdjustedPrice": 131275.73, "btcHoldings": 499026.0, "marketCap": 65510000000.0}, {"date": "2025-03-01", "spotPrice": 82548.9140625, "mnav": 1.7, "mnavAdjustedPrice": 139969.9, "btcHoldings": 528185.0, "marketCap": 73930000000.0}, {"date": "2025-04-01", "spotPrice": 94207.3125, "mnav": 2.08, "mnavAdjustedPrice": 196081.0, "btcHoldings": 533555.0, "marketCap": 104620000000.0}, {"date": "2025-05-01", "spotPrice": 104638.09375, "mnav": 1.67, "mnavAdjustedPrice": 175062.47, "btcHoldings": 580250.0, "marketCap": 101580000000.0}, {"date": "2025-06-01", "spotPrice": 107135.3359375, "mnav": 1.74, "mnavAdjustedPrice": 186263.76, "btcHoldings": 597325.0, "marketCap": 111260000000.0}, {"date": "2025-07-01", "spotPrice": 115758.203125, "mnav": 1.52, "mnavAdjustedPrice": 175909.01, "btcHoldings": 628791.0, "marketCap": 110610000000.0}, {"date": "2025-08-01", "spotPrice": 108236.7109375, "mnav": 1.34, "mnavAdjustedPrice": 145527.68, "btcHoldings": 632457.0, "marketCap": 92040000000.0}, {"date": "2025-09-01", "spotPrice": 114056.0859375, "mnav": 1.23, "mnavAdjustedPrice": 138613.86, "btcHoldings": 639835.0, "marketCap": 88690000000.0}];

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

    // Calculate regressions (use preset for BTC if not default)
    const btcRegression = calculateRegression(btcData, currentPreset !== 'default');
    const mnavRegression = calculateRegression(mnavData.map(d => ({
        date: d.date,
        price: d.mnavAdjustedPrice
    })), currentPreset !== 'default');

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
            }

            if (minDate) {
                chart.options.scales.x.min = minDate.toISOString().split('T')[0];
            } else {
                delete chart.options.scales.x.min;
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