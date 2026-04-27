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
    const isLive = (periodPreset === '1');
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
            const chartElement = document.getElementById('mainChart');
            if (chartElement) {
                const chartContainer = chartElement.parentElement;
                chartContainer.innerHTML = '<div class="no-data-message" style="text-align: center; padding: 40px; color: #94a3b8; width: 100%;">Нет данных</div>';
            }
            if (chartInstance) {
                chartInstance.destroy();
                chartInstance = null;
            }
            return;
        }

        // Apply timezone offset before sorting
        const timezoneOffset = getTimezoneOffset((window.systemConfig && window.systemConfig.timezone) || 'UTC+4');
        const serverOffset = 240; // server is UTC+4
        const timezoneAdjustment = timezoneOffset - serverOffset;
        data.forEach(d => {
            if (d.timestamp) {
                const dt = new Date(d.timestamp);
                dt.setMinutes(dt.getMinutes() + timezoneAdjustment);
                d.timestamp = dt.toISOString();
            }
        });

        data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        // Фильтруем данные - оставляем только те, где есть выбранная метрика
        const filteredData = data.filter(d => d[currentMetric] !== undefined && d[currentMetric] !== null);
        
        if (filteredData.length === 0) {
            const chartContainer = document.getElementById('mainChart').parentElement;
            chartContainer.innerHTML = '<div class="no-data-message" style="text-align: center; padding: 40px; color: #94a3b8; width: 100%;">Нет данных</div>';
            if (chartInstance) {
                chartInstance.destroy();
                chartInstance = null;
            }
            return;
        }

        const { labels, values, timeSpanHours } = aggregateDataForChart(filteredData, currentMetric, 150);

        // Apply unit conversions for Y-axis values
        let convertedValues = values;
        let yAxisTitle = getMetricLabel(currentMetric);
        
        if (currentMetric === 'temperature' && window.systemConfig && window.systemConfig.tempUnit === 'fahrenheit') {
            convertedValues = values.map(v => convertTemperature(v, 'fahrenheit'));
            yAxisTitle = 'Температура (°F)';
        } else if (currentMetric === 'pressure' && window.systemConfig && window.systemConfig.pressureUnit) {
            convertedValues = values.map(v => convertPressure(v, window.systemConfig.pressureUnit));
            yAxisTitle = `Давление (${getPressureUnitLabel(window.systemConfig.pressureUnit)})`;
        }

        // Clear the "Нет данных" message if it exists and restore canvas
        let chartElement = document.getElementById('mainChart');
        let chartContainer = document.querySelector('.chart-container');
        if (!chartElement && chartContainer) {
            if (chartContainer.innerHTML && chartContainer.innerHTML.includes('no-data-message')) {
                chartContainer.innerHTML = '<canvas id="mainChart" width="800" height="350"></canvas>';
                chartElement = document.getElementById('mainChart');
            }
        }
        if (!chartElement) {
            chartElement = document.getElementById('mainChart');
        }

        const xAxisTitle = timeSpanHours > 48 ? 'Дата' : 'Время';

        if (chartInstance) {
            chartInstance.data.labels = labels;
            chartInstance.data.datasets[0].data = convertedValues;
            const deviceInfo = window.allDevices.find(d => d.device_name === deviceName);
            const displayName = deviceInfo ? deviceInfo.display_name : deviceName;
            chartInstance.data.datasets[0].label = `${displayName} - ${yAxisTitle}`;
            if (chartInstance.options.scales && chartInstance.options.scales.x) {
                chartInstance.options.scales.x.title.text = xAxisTitle;
            }
            if (chartInstance.options.scales && chartInstance.options.scales.y) {
                chartInstance.options.scales.y.title.text = yAxisTitle;
            }
            updateChartBounds(chartInstance, convertedValues, currentMetric);
            chartInstance.update();
        } else {
            let minVal = Math.min(...convertedValues), maxVal = Math.max(...convertedValues);
            let padding = currentMetric === 'temperature' ? Math.max(2, (maxVal - minVal) * 0.2) : (currentMetric === 'humidity' ? Math.max(5, (maxVal - minVal) * 0.15) : Math.max(3, (maxVal - minVal) * 0.1));
            let yMin = minVal - padding, yMax = maxVal + padding;
            if (currentMetric === 'humidity') { yMin = Math.max(0, yMin); yMax = Math.min(100, yMax); }
            const finalYMin = Math.floor(yMin * 10) / 10, finalYMax = Math.ceil(yMax * 10) / 10;
            const ctx = document.getElementById('mainChart').getContext('2d');
            const deviceInfo = window.allDevices.find(d => d.device_name === deviceName);
            const displayName = deviceInfo ? deviceInfo.display_name : deviceName;
            chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: `${displayName} - ${yAxisTitle}`,
                        data: convertedValues,
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
                        legend: { 
                            position: 'top',
                            onClick: null // Отключаем возможность скрытия графика по клику на легенде
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            callbacks: {
                                label: (ctx) => {
                                    let label = ctx.dataset.label || '';
                                    let value = ctx.parsed.y;
                                    let unit = currentMetric === 'temperature' ? '°C' : (currentMetric === 'humidity' ? '%' : 'гПа');
                                    if (currentMetric === 'temperature' && window.systemConfig && window.systemConfig.tempUnit === 'fahrenheit') {
                                        unit = '°F';
                                    } else if (currentMetric === 'pressure' && window.systemConfig && window.systemConfig.pressureUnit) {
                                        unit = getPressureUnitLabel(window.systemConfig.pressureUnit);
                                    }
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
                            title: { display: true, text: yAxisTitle, font: { size: 12 } },
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
