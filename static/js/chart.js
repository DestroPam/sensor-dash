// График функции

function updateChartBounds(chart, values, metric) {
    if (!values || values.length === 0) return;
    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);
    if (minVal === maxVal) {
        if (metric === 'temperature') { minVal = minVal - 2; maxVal = maxVal + 2; }
        else if (metric === 'humidity') { minVal = Math.max(0, minVal - 5); maxVal = Math.min(100, maxVal + 5); }
        else { minVal = minVal - 5; maxVal = maxVal + 5; }
    } else {
        let padding;
        if (metric === 'temperature') padding = Math.max(2, (maxVal - minVal) * 0.2);
        else if (metric === 'humidity') padding = Math.max(5, (maxVal - minVal) * 0.15);
        else padding = Math.max(3, (maxVal - minVal) * 0.1);
        minVal = minVal - padding;
        maxVal = maxVal + padding;
        if (metric === 'humidity') { minVal = Math.max(0, minVal); maxVal = Math.min(100, maxVal); }
    }
    if (chart.options.scales && chart.options.scales.y) {
        chart.options.scales.y.min = Math.floor(minVal * 10) / 10;
        chart.options.scales.y.max = Math.ceil(maxVal * 10) / 10;
        chart.update('none');
    }
}

function startLiveChartUpdates() {
    if (liveChartInterval) clearInterval(liveChartInterval);
    isLiveMode = true;
    liveChartInterval = setInterval(() => {
        if (viewMode === 'detail' && currentDevice && isLiveMode) {
            loadChartData(currentDevice);
            loadLatestData(currentDevice);
        }
    }, 10000);
}

function stopLiveChartUpdates() {
    if (liveChartInterval) {
        clearInterval(liveChartInterval);
        liveChartInterval = null;
    }
    isLiveMode = false;
}

function checkAndStartLiveMode() {
    const periodPreset = document.getElementById('periodPreset').value;
    const isLive = (periodPreset === '3');
    if (isLive && currentDevice) {
        startLiveChartUpdates();
    } else {
        stopLiveChartUpdates();
    }
}

async function loadChartData(deviceName) {
    if (!deviceName) return;
    currentMetric = document.getElementById('metricType').value;
    const periodPreset = document.getElementById('periodPreset').value;
    let url = `/api/data/device/${encodeURIComponent(deviceName)}?limit=5000`;
    if (periodPreset === 'custom') {
        const startDate = document.getElementById('startDate').value;
        const endDate = document.getElementById('endDate').value;
        if (startDate && endDate) url += `&start_date=${startDate}&end_date=${endDate}`;
    } else if (periodPreset !== 'all') {
        url += `&hours=${periodPreset}`;
    }
    try {
        const response = await fetch(url);
        let data = await response.json();
        if (data.length === 0) {
            if (chartInstance) { chartInstance.data.labels = ['Нет данных']; chartInstance.data.datasets[0].data = [0]; chartInstance.update(); }
            else { const ctx = document.getElementById('mainChart').getContext('2d'); chartInstance = new Chart(ctx, { type: 'line', data: { labels: ['Нет данных'], datasets: [{ label: 'Нет данных', data: [0], borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.3, fill: true }] }, options: { responsive: true, maintainAspectRatio: true } }); }
            return;
        }

        data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const { labels, values, timeSpanHours } = aggregateDataForChart(data, 150);

        const metricName = getMetricLabel(currentMetric);
        const xAxisTitle = timeSpanHours > 48 ? 'Дата' : 'Время';

        if (chartInstance) {
            chartInstance.data.labels = labels;
            chartInstance.data.datasets[0].data = values;
            chartInstance.data.datasets[0].label = `${deviceName} - ${metricName}`;
            if (chartInstance.options.scales && chartInstance.options.scales.x) {
                chartInstance.options.scales.x.title.text = xAxisTitle;
            }
            if (chartInstance.options.scales && chartInstance.options.scales.y) {
                chartInstance.options.scales.y.title.text = metricName;
            }
            updateChartBounds(chartInstance, values, currentMetric);
            chartInstance.update();
        } else {
            let minVal = Math.min(...values), maxVal = Math.max(...values);
            let padding = currentMetric === 'temperature' ? Math.max(2, (maxVal - minVal) * 0.2) : (currentMetric === 'humidity' ? Math.max(5, (maxVal - minVal) * 0.15) : Math.max(3, (maxVal - minVal) * 0.1));
            let yMin = minVal - padding, yMax = maxVal + padding;
            if (currentMetric === 'humidity') { yMin = Math.max(0, yMin); yMax = Math.min(100, yMax); }
            const finalYMin = Math.floor(yMin * 10) / 10, finalYMax = Math.ceil(yMax * 10) / 10;
            const ctx = document.getElementById('mainChart').getContext('2d');
            chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: `${deviceName} - ${metricName}`,
                        data: values,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.3,
                        fill: true,
                        pointRadius: labels.length > 100 ? 0 : 2,
                        pointHoverRadius: 4,
                        spanGaps: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    animation: { duration: 500 },
                    plugins: {
                        legend: { position: 'top' },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                label: (ctx) => {
                                    let label = ctx.dataset.label || '';
                                    let value = ctx.parsed.y;
                                    let unit = currentMetric === 'temperature' ? '°C' : (currentMetric === 'humidity' ? '%' : 'гПа');
                                    return `${label}: ${value.toFixed(1)}${unit}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                maxRotation: 45,
                                minRotation: 45,
                                autoSkip: true,
                                maxTicksLimit: 12
                            },
                            title: { display: true, text: xAxisTitle, font: { size: 12 } }
                        },
                        y: {
                            min: finalYMin,
                            max: finalYMax,
                            beginAtZero: currentMetric === 'humidity',
                            title: { display: true, text: metricName, font: { size: 12 } },
                            ticks: {
                                callback: value => value.toFixed(1),
                                stepSize: (finalYMax - finalYMin) / 5,
                                maxTicksLimit: 6
                            },
                            grid: { color: 'rgba(0, 0, 0, 0.05)' }
                        }
                    },
                    elements: { point: { radius: labels.length > 100 ? 0 : 1, hoverRadius: 4 }, line: { borderWidth: 2 } },
                    interaction: { mode: 'nearest', axis: 'x', intersect: false }
                }
            });
        }
    } catch (error) { console.error('Ошибка загрузки графика:', error); }
}

function toggleCustomDateRange() {
    const periodPreset = document.getElementById('periodPreset').value;
    const customRange = document.getElementById('customDateRange');
    if (periodPreset === 'custom') {
        customRange.style.display = 'flex';
        setDefaultCustomRange();
    } else {
        customRange.style.display = 'none';
    }
    if (viewMode === 'detail' && currentDevice) {
        checkAndStartLiveMode();
        loadChartData(currentDevice);
    }
}
