// Утилиты и вспомогательные функции

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function formatDateTimeLocal(date) {
    return date.toISOString().slice(0, 16);
}

function setDefaultCustomRange() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
    document.getElementById('startDate').value = formatDateTimeLocal(todayStart);
    document.getElementById('endDate').value = formatDateTimeLocal(tomorrowStart);
}

function formatXLabel(date, timeSpanHours) {
    if (timeSpanHours > 720) {
        return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}.${date.getFullYear().toString().slice(-2)}`;
    } else if (timeSpanHours > 48) {
        return `${date.getDate().toString().padStart(2, '0')}.${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    } else {
        return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    }
}

function aggregateDataForChart(data, maxPoints = 150) {
    if (!data || data.length === 0) return { labels: [], values: [], timeSpanHours: 0 };

    const firstTime = new Date(data[0].timestamp);
    const lastTime = new Date(data[data.length - 1].timestamp);
    const timeSpanHours = (lastTime - firstTime) / (1000 * 3600);

    if (data.length <= maxPoints) {
        const labels = data.map(d => {
            const date = new Date(d.timestamp);
            return formatXLabel(date, timeSpanHours);
        });
        return { labels, values: data.map(d => d[currentMetric]), timeSpanHours };
    }

    const intervalSize = Math.ceil(data.length / maxPoints);
    const aggregatedLabels = [];
    const aggregatedValues = [];

    for (let i = 0; i < data.length; i += intervalSize) {
        const chunk = data.slice(i, Math.min(i + intervalSize, data.length));
        if (chunk.length === 0) continue;

        const avgValue = chunk.reduce((sum, d) => sum + d[currentMetric], 0) / chunk.length;
        const midIndex = Math.floor(chunk.length / 2);
        const midTimestamp = chunk[midIndex].timestamp;
        const date = new Date(midTimestamp);

        let label = formatXLabel(date, timeSpanHours);
        aggregatedLabels.push(label);
        aggregatedValues.push(avgValue);
    }

    return { labels: aggregatedLabels, values: aggregatedValues, timeSpanHours };
}

function getMetricLabel(metric) {
    if (metric === 'temperature') return 'Температура (°C)';
    if (metric === 'humidity') return 'Влажность (%)';
    return 'Давление (гПа)';
}

function highlightSelectedSensor(deviceName) {
    const cards = document.querySelectorAll('.sensor-card');
    cards.forEach(card => {
        if (card.getAttribute('data-device') === deviceName) card.classList.add('active');
        else card.classList.remove('active');
    });
}

function swapElements(el1, el2, container) {
    const allItems = container.querySelectorAll(el1.className.includes('sensor-tile') ? '.sensor-tile' : '.sensor-card');
    const index1 = Array.from(allItems).indexOf(el1);
    const index2 = Array.from(allItems).indexOf(el2);
    if (index1 < index2) {
        el2.parentNode.insertBefore(el1, el2.nextSibling);
    } else {
        el2.parentNode.insertBefore(el1, el2);
    }
}

function sortDevices(devices, location = 'list') {
    const order = location === 'grid' ? gridDeviceOrder : listDeviceOrder;
    console.log(`Sorting for ${location}. Using order:`, order);
    if (!order || order.length === 0) {
        console.log(`${location} order is empty, returning original order`);
        return devices;
    }
    const sorted = [];
    order.forEach(name => {
        const device = devices.find(d => {
            const deviceName = typeof d === 'string' ? d : d.device_name;
            return deviceName === name;
        });
        if (device) sorted.push(device);
    });
    devices.forEach(d => {
        if (!sorted.find(s => {
            const sName = typeof s === 'string' ? s : s.device_name;
            const dName = typeof d === 'string' ? d : d.device_name;
            return sName === dName;
        })) {
            sorted.push(d);
        }
    });
    console.log(`Final sorted order for ${location}:`, sorted);
    return sorted;
}

function updateAdminDeviceLists(devices) {
    const deviceSelect = document.getElementById('adminDeviceSelect');
    const rangeDeviceSelect = document.getElementById('adminRangeDeviceSelect');
    const renameDeviceSelect = document.getElementById('adminRenameDeviceSelect');

    const options = devices.map(d => {
        const deviceName = typeof d === 'string' ? d : d.device_name;
        return `<option value="${escapeHtml(deviceName)}">${escapeHtml(deviceName)}</option>`;
    }).join('');

    if (deviceSelect) deviceSelect.innerHTML = options;
    if (rangeDeviceSelect) rangeDeviceSelect.innerHTML = '<option value="">Все датчики</option>' + options;
    if (renameDeviceSelect) renameDeviceSelect.innerHTML = options;
}
