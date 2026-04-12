// API функции

function loadDeviceOrder() {
    return Promise.all([
        fetch('/api/device-order/list').then(res => res.json()),
        fetch('/api/device-order/grid').then(res => res.json())
    ])
    .then(([listOrder, gridOrder]) => {
        listDeviceOrder = listOrder || [];
        gridDeviceOrder = gridOrder || [];
        console.log('Loaded order - List:', listDeviceOrder, 'Grid:', gridDeviceOrder);
    })
    .catch(err => console.error('Error loading device order:', err));
}

function saveDeviceOrder(items, location) {
    const deviceOrder = Array.from(items).map(item => item.getAttribute('data-device') ||
        item.querySelector('.tile-device-name')?.textContent?.replace('📌 ', '') || '');

    // Удаляем дубликаты
    const uniqueOrder = [...new Set(deviceOrder)];

    console.log(`Saving ${location} order:`, uniqueOrder);

    // Обновляем локальный порядок
    if (location === 'grid') {
        gridDeviceOrder = uniqueOrder;
    } else {
        listDeviceOrder = uniqueOrder;
    }

    // Сохраняем на сервер
    fetch(`/api/device-order/${location}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_order: uniqueOrder })
    })
    .then(res => res.json())
    .then(data => console.log(`${location} order saved:`, data))
    .catch(err => console.error('Error saving device order:', err));
}

async function loadGridData() {
    try {
        const devicesResponse = await fetch('/api/devices');
        const devices = await devicesResponse.json();
        const sortedDevices = sortDevices(devices, 'grid');
        const latestResponse = await fetch('/api/data/latest');
        const latestData = await latestResponse.json();
        const container = document.getElementById('sensorsGrid');
        if (sortedDevices.length === 0) {
            container.innerHTML = '<div class="empty-grid">📭 Нет данных<br>Запустите эмулятор датчиков</div>';
            return;
        }
        const latestMap = {};
        latestData.forEach(item => { latestMap[item.device_name] = item; });
        let gridHtml = '';
        sortedDevices.forEach((device) => {
            const latest = latestMap[device];
            const temp = latest ? latest.temperature.toFixed(1) : '--';
            const hum = latest ? latest.humidity.toFixed(1) : '--';
            const press = latest ? latest.pressure.toFixed(1) : '--';
            const timestamp = latest ? new Date(latest.timestamp) : null;
            const timeStr = timestamp ? timestamp.toLocaleTimeString() : 'нет данных';
            let status = '🟢 онлайн';
            if (timestamp) {
                const diffSeconds = Math.floor((new Date() - timestamp) / 1000);
                if (diffSeconds > 60) status = '🔴 оффлайн';
                else if (diffSeconds > 10) status = '🟡 ожидание';
            } else status = '⚫ нет данных';
            gridHtml += `
                <div class="sensor-tile" data-device="${escapeHtml(device)}" onclick="showDetailView('${escapeHtml(device)}')">
                    <div class="tile-header">
                        <span class="tile-device-name">${escapeHtml(device)}</span>
                        <span class="tile-status">${status}</span>
                    </div>
                    <div class="tile-metrics">
                        <div class="tile-metric"><span class="tile-metric-label">🌡️ Температура</span><span class="tile-metric-value">${temp}<span class="tile-metric-unit">°C</span></span></div>
                        <div class="tile-metric"><span class="tile-metric-label">💧 Влажность</span><span class="tile-metric-value">${hum}<span class="tile-metric-unit">%</span></span></div>
                        <div class="tile-metric"><span class="tile-metric-label">⏲️ Давление</span><span class="tile-metric-value">${press}<span class="tile-metric-unit">гПа</span></span></div>
                    </div>
                    <div class="tile-update-time">🕐 ${timeStr}</div>
                </div>
            `;
        });
        container.innerHTML = gridHtml;
        setupDragAndDrop(container, true);
    } catch (error) {
        console.error('Ошибка загрузки сетки:', error);
        document.getElementById('sensorsGrid').innerHTML = '<div class="empty-grid">❌ Ошибка загрузки данных</div>';
    }
}

async function loadDevices() {
    try {
        const response = await fetch('/api/devices');
        const devices = await response.json();
        const sortedDevices = sortDevices(devices, 'list');
        const latestResponse = await fetch('/api/data/latest');
        const latestData = await latestResponse.json();
        const container = document.getElementById('sensorsList');
        if (sortedDevices.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8;">Нет данных<br>Запустите эмулятор</div>';
            return;
        }
        const latestMap = {};
        latestData.forEach(item => { latestMap[item.device_name] = item; });
        container.innerHTML = '';
        sortedDevices.forEach(device => {
            const latest = latestMap[device];

            // Определяем статус датчика
            let statusIcon = '🔴'; // красный - оффлайн
            let statusColor = '#ef4444';
            if (latest) {
                const updatedAt = new Date(latest.timestamp);
                const now = new Date();
                const diffSeconds = Math.floor((now - updatedAt) / 1000);
                console.log(`${device}: diffSeconds=${diffSeconds}, color would be ${diffSeconds < 60 ? 'green' : 'red'}`);
                if (diffSeconds < 60) {
                    statusIcon = '🟢'; // зеленый - онлайн
                    statusColor = '#10b981';
                }
            } else {
                console.log(`${device}: no latest data`);
            }

            const card = document.createElement('div');
            card.className = `sensor-card ${currentDevice === device ? 'active' : ''}`;
            card.setAttribute('data-device', device);
            card.innerHTML = `<div><div class="sensor-name">${escapeHtml(device)}</div></div><span style="font-size: 20px; color: ${statusColor} !important;">${statusIcon}</span>`;
            card.onclick = () => {
                if (viewMode === 'grid') showDetailView(device);
                else { currentDevice = device; highlightSelectedSensor(device); loadLatestData(device); checkAndStartLiveMode(); loadChartData(device); }
            };
            container.appendChild(card);
        });
        setupDragAndDrop(container, false);
        if (isAdmin) updateAdminDeviceLists(sortedDevices);
    } catch (error) { console.error('Ошибка загрузки устройств:', error); }
}

async function loadLatestData(deviceName) {
    try {
        const response = await fetch(`/api/data/device/${encodeURIComponent(deviceName)}?limit=1&sort=desc`);
        const data = await response.json();
        if (data && data.length > 0) {
            const latest = data[0];
            document.getElementById('currentSensorName').innerHTML = `📌 ${deviceName}`;
            document.getElementById('tempVal').innerHTML = latest.temperature.toFixed(1);
            document.getElementById('humVal').innerHTML = latest.humidity.toFixed(1);
            document.getElementById('pressVal').innerHTML = latest.pressure.toFixed(1);
            const updateTime = new Date(latest.timestamp);
            const now = new Date();
            const diffSeconds = Math.floor((now - updateTime) / 1000);
            const statusEl = document.getElementById('liveStatus');
            if (diffSeconds < 10) { statusEl.innerHTML = '🟢 онлайн'; statusEl.style.background = '#10b981'; }
            else if (diffSeconds < 60) { statusEl.innerHTML = `🟡 ${diffSeconds} сек назад`; statusEl.style.background = '#f59e0b'; }
            else { statusEl.innerHTML = `🔴 ${Math.floor(diffSeconds / 60)} мин назад`; statusEl.style.background = '#ef4444'; }
        } else {
            document.getElementById('currentSensorName').innerHTML = `📌 ${deviceName} (нет данных)`;
            document.getElementById('tempVal').innerHTML = '--'; document.getElementById('humVal').innerHTML = '--'; document.getElementById('pressVal').innerHTML = '--';
            document.getElementById('liveStatus').innerHTML = '⚫ нет данных'; document.getElementById('liveStatus').style.background = '#64748b';
        }
    } catch (error) { console.error('Ошибка загрузки данных:', error); }
}
