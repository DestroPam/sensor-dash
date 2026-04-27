// API функции

// Load system configuration
async function loadSystemConfig() {
    try {
        // Try to get settings from admin endpoint or a new endpoint
        // For now, use defaults; will be overridden if admin sets them
        window.systemConfig = {
            offlineTimeout: 60,
            timezone: 'UTC+4',
            tempUnit: 'celsius',
            pressureUnit: 'hpa'
        };
        
        // Try to fetch from settings (will work if logged in as admin)
        try {
            const response = await fetch('/api/admin/settings');
            if (response.ok) {
                const data = await response.json();
                window.systemConfig = {
                    offlineTimeout: parseInt(data.offline_timeout) || 60,
                    timezone: data.timezone || 'UTC+4',
                    tempUnit: data.temperature_unit || 'celsius',
                    pressureUnit: data.pressure_unit || 'hpa'
                };
            }
        } catch (e) {
            // Non-admin users use defaults
        }
    } catch (error) {
        console.error('Error loading system config:', error);
    }
}

function loadDeviceOrder() {
    console.log('🔄 Загрузка порядка датчиков...');
    return Promise.race([
        Promise.all([
            fetch('/api/device-order/list').then(res => {
                if (!res.ok) throw new Error(`API error: ${res.status}`);
                return res.json();
            }),
            fetch('/api/device-order/grid').then(res => {
                if (!res.ok) throw new Error(`API error: ${res.status}`);
                return res.json();
            })
        ]),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Device order timeout')), 3000))
    ])
        .then(([listOrder, gridOrder]) => {
            listDeviceOrder = listOrder || [];
            gridDeviceOrder = gridOrder || [];
            console.log('✅ Порядок загружен - List:', listDeviceOrder.length, 'Grid:', gridDeviceOrder.length);
        })
        .catch(err => {
            console.error('⚠️ Ошибка загрузки порядка (используем стандартный):', err);
            listDeviceOrder = [];
            gridDeviceOrder = [];
        });
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
        console.log('📊 Загрузка сетки датчиков...');
        const devicesResponse = await fetch('/api/devices');
        if (!devicesResponse.ok) throw new Error(`API error: ${devicesResponse.status}`);

        const devicesData = await devicesResponse.json();
        console.log('✅ Список устройств загружен:', devicesData.length);

        // Преобразуем в объекты с device_name и display_name
        let devices = devicesData;
        if (devices.length > 0 && typeof devices[0] === 'string') {
            devices = devices.map(d => ({ device_name: d, display_name: d }));
        }

        const sortedDevices = sortDevices(devices, 'grid');
        const latestResponse = await fetch('/api/data/latest');
        if (!latestResponse.ok) throw new Error(`API error: ${latestResponse.status}`);

        const latestData = await latestResponse.json();
        console.log('✅ Последние данные загружены:', latestData.length);

        const container = document.getElementById('sensorsGrid');
        if (sortedDevices.length === 0) {
            console.log('⚠️ Нет данных датчиков');
            container.innerHTML = '<div class="empty-grid">📭 Нет данных<br>Запустите эмулятор датчиков</div>';
            return;
        }

        const latestMap = {};
        latestData.forEach(item => { latestMap[item.device_name] = item; });
        
        // Get offline timeout from settings
        const offlineTimeout = (window.systemConfig && window.systemConfig.offlineTimeout) || 60;
        const tempUnit = (window.systemConfig && window.systemConfig.tempUnit) || 'celsius';
        const pressUnit = (window.systemConfig && window.systemConfig.pressureUnit) || 'hpa';
        const timezoneOffset = getTimezoneOffset((window.systemConfig && window.systemConfig.timezone) || 'UTC+4');
        const serverOffset = 240; // UTC+4 in minutes
        const timezoneAdjustment = timezoneOffset - serverOffset;
        
        let gridHtml = '';
        sortedDevices.forEach((device) => {
            const deviceName = typeof device === 'string' ? device : device.device_name;
            const displayName = typeof device === 'string' ? device : device.display_name;
            const latest = latestMap[deviceName];
            const hasTemp = latest && latest.temperature != null;
            const hasHum = latest && latest.humidity != null;
            const hasPress = latest && latest.pressure != null;
            
            // Apply unit conversions
            const temp = hasTemp ? convertTemperature(latest.temperature, tempUnit).toFixed(1) : '--';
            const tempDisplayLabel = tempUnit === 'fahrenheit' ? '°F' : '°C';
            
            const hum = hasHum ? latest.humidity.toFixed(1) : '--';
            const press = hasPress ? convertPressure(latest.pressure, pressUnit).toFixed(1) : '--';
            const pressDisplayLabel = getPressureUnitLabel(pressUnit);
            
            const timestamp = latest ? new Date(latest.timestamp) : null;
            // Apply timezone adjustment to display time
            let timeStr = 'нет данных';
            if (timestamp) {
                const adjustedTime = new Date(timestamp.getTime() + timezoneAdjustment * 60000);
                timeStr = adjustedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }
            
            let status = '🟢 онлайн';
            if (timestamp) {
                const now = new Date();
                const diffSeconds = Math.floor((now - timestamp) / 1000);
                if (diffSeconds > offlineTimeout) status = '🔴 оффлайн';
            } else status = '⚫ нет данных';
            
            gridHtml += `
                <div class="sensor-tile" data-device="${escapeHtml(deviceName)}" onclick="showDetailView('${escapeHtml(deviceName)}')">
                    <div class="tile-header">
                        <span class="tile-device-name" ondblclick="startEditSensor('${escapeHtml(deviceName)}', this, '${escapeHtml(displayName)}')" style="cursor: default; user-select: none;">${escapeHtml(displayName)}</span>
                        <span class="tile-status">${status}</span>
                    </div>
                    <div class="tile-metrics">
                        ${hasTemp ? `<div class="tile-metric"><span class="tile-metric-label">🌡️ Температура</span><span class="tile-metric-value">${temp}<span class="tile-metric-unit">${tempDisplayLabel}</span></span></div>` : ''}
                        ${hasHum ? `<div class="tile-metric"><span class="tile-metric-label">💧 Влажность</span><span class="tile-metric-value">${hum}<span class="tile-metric-unit">%</span></span></div>` : ''}
                        ${hasPress ? `<div class="tile-metric"><span class="tile-metric-label">⏲️ Давление</span><span class="tile-metric-value">${press}<span class="tile-metric-unit">${pressDisplayLabel}</span></span></div>` : ''}
                    </div>
                    <div class="tile-update-time">🕐 ${timeStr}</div>
                </div>
            `;
        });
        container.innerHTML = gridHtml;
        setupDragAndDrop(container, true);
        console.log('✅ Сетка отрисована');
    } catch (error) {
        console.error('❌ Ошибка загрузки сетки:', error);
        const container = document.getElementById('sensorsGrid');
        if (container) {
            container.innerHTML = '<div class="empty-grid">❌ Ошибка загрузки данных<br>' + error.message + '</div>';
        }
    }
}

async function loadDevices() {
    try {
        console.log('👁️ Загрузка списка датчиков...');
        const response = await fetch('/api/devices');
        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const devicesData = await response.json();
        console.log('✅ Датчики загружены:', devicesData.length);

        // Преобразуем в объекты с device_name и display_name если нужно
        let devices = devicesData;
        if (devices.length > 0 && typeof devices[0] === 'string') {
            devices = devices.map(d => ({ device_name: d, display_name: d }));
        }

        const sortedDevices = sortDevices(devices, 'list');
        window.allDevices = sortedDevices;
        const latestResponse = await fetch('/api/data/latest');
        if (!latestResponse.ok) throw new Error(`API error: ${latestResponse.status}`);

        const latestData = await latestResponse.json();
        console.log('✅ Данные датчиков загружены:', latestData.length);

        const container = document.getElementById('sensorsList');
        if (sortedDevices.length === 0) {
            console.log('⚠️ Список датчиков пуст');
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #94a3b8;">Нет данных<br>Запустите эмулятор</div>';
            return;
        }

        const latestMap = {};
        latestData.forEach(item => { latestMap[item.device_name] = item; });
        
        // Get offline timeout from settings
        const offlineTimeout = (window.systemConfig && window.systemConfig.offlineTimeout) || 60;
        
        container.innerHTML = '';
        sortedDevices.forEach(device => {
            const deviceName = typeof device === 'string' ? device : device.device_name;
            const displayName = typeof device === 'string' ? device : device.display_name;
            const latest = latestMap[deviceName];

            // Determine status with custom timeout
            let statusIcon = '🔴'; // красный - оффлайн
            let statusColor = '#ef4444';
            if (latest) {
                const updatedAt = new Date(latest.timestamp);
                const now = new Date();
                const diffSeconds = Math.floor((now - updatedAt) / 1000);
                if (diffSeconds < offlineTimeout) {
                    statusIcon = '🟢'; // зеленый - онлайн
                    statusColor = '#10b981';
                }
            }

            const card = document.createElement('div');
            card.className = `sensor-card ${currentDevice === deviceName ? 'active' : ''}`;
            card.setAttribute('data-device', deviceName);

            const nameDiv = document.createElement('div');
            nameDiv.style.width = '100%';

            const sensorName = document.createElement('div');
            sensorName.className = 'sensor-name';
            sensorName.innerHTML = escapeHtml(displayName);
            sensorName.ondblclick = (e) => startEditSensor(deviceName, sensorName, displayName);
            sensorName.style.cursor = 'default';

            nameDiv.appendChild(sensorName);

            const statusSpan = document.createElement('span');
            statusSpan.style.fontSize = '20px';
            statusSpan.style.color = statusColor;
            statusSpan.innerHTML = statusIcon;

            card.appendChild(nameDiv);
            card.appendChild(statusSpan);

            card.onclick = () => {
                if (viewMode === 'grid') showDetailView(deviceName);
                else { currentDevice = deviceName; highlightSelectedSensor(deviceName); loadLatestData(deviceName); checkAndStartLiveMode(); loadChartData(deviceName); }
            };
            container.appendChild(card);
        });
        setupDragAndDrop(container, false);
        console.log('✅ Список датчиков отрисован');
    } catch (error) {
        console.error('❌ Ошибка загрузки устройств:', error);
        const container = document.getElementById('sensorsList');
        if (container) {
            container.innerHTML = '<div style="text-align: center; padding: 20px; color: #ef4444;">❌ Ошибка загрузки<br>' + error.message + '</div>';
        }
    }
}

async function loadLatestData(deviceName) {
    try {
        const response = await fetch(`/api/data/device/${encodeURIComponent(deviceName)}?limit=1&sort=desc`);
        const data = await response.json();
        if (data && data.length > 0) {
            const latest = data[0];
            const displayName = latest.display_name || latest.device_name || deviceName;

            const sensorNameEl = document.getElementById('currentSensorName');
            // Если пользователь редактирует имя (есть input), не трогаем элемент
            if (!sensorNameEl.querySelector('input')) {
                sensorNameEl.innerHTML = `📌 ${escapeHtml(displayName)}`;
                sensorNameEl.ondblclick = (e) => {
                    e.stopPropagation();
                    startEditDetailSensorName(deviceName, displayName, sensorNameEl);
                };
                sensorNameEl.style.cursor = 'default';
            }

            // Получаем настройки
            const tempUnit = (window.systemConfig && window.systemConfig.tempUnit) || 'celsius';
            const pressUnit = (window.systemConfig && window.systemConfig.pressureUnit) || 'hpa';
            const timezoneOffset = getTimezoneOffset((window.systemConfig && window.systemConfig.timezone) || 'UTC+4');
            const serverOffset = 240; // server is UTC+4
            const timezoneAdjustment = timezoneOffset - serverOffset;

            // Обновляем селект метрик в зависимости от доступных данных
            const metricSelect = document.getElementById('metricType');
            const hasTemp = latest.temperature != null;
            const hasHum = latest.humidity != null;
            const hasPress = latest.pressure != null;

            metricSelect.innerHTML = '';
            if (hasTemp) metricSelect.innerHTML += `<option value="temperature">🌡️ Температура (${tempUnit === 'fahrenheit' ? '°F' : '°C'})</option>`;
            if (hasHum) metricSelect.innerHTML += `<option value="humidity">💧 Влажность (%)</option>`;
            if (hasPress) metricSelect.innerHTML += `<option value="pressure">⏲️ Давление (${getPressureUnitLabel(pressUnit)})</option>`;

            // Устанавливаем значение select в соответствии с currentMetric
            if (metricSelect.options.length > 0) {
                const currentOption = metricSelect.querySelector(`option[value="${currentMetric}"]`);
                if (currentOption) {
                    metricSelect.value = currentMetric;
                } else {
                    currentMetric = metricSelect.options[0].value;
                    metricSelect.value = currentMetric;
                }
            } else {
                currentMetric = null;
            }

            // Показываем/скрываем блоки метрик
            const hasAnyMetric = hasTemp || hasHum || hasPress;
            document.getElementById('sensorMetrics').style.display = hasAnyMetric ? 'flex' : 'none';
            document.querySelector('.metric-temp').style.display = hasTemp ? 'block' : 'none';
            document.querySelector('.metric-hum').style.display = hasHum ? 'block' : 'none';
            document.querySelector('.metric-press').style.display = hasPress ? 'block' : 'none';

            // Применяем конвертацию единиц
            document.getElementById('tempVal').innerHTML = hasTemp ? convertTemperature(latest.temperature, tempUnit).toFixed(1) + (tempUnit === 'fahrenheit' ? ' °F' : ' °C') : '--';
            document.getElementById('humVal').innerHTML = hasHum ? latest.humidity.toFixed(1) + ' %' : '--';
            document.getElementById('pressVal').innerHTML = hasPress ? convertPressure(latest.pressure, pressUnit).toFixed(1) + ' ' + getPressureUnitLabel(pressUnit) : '--';
            
            // Adjust timestamp to selected timezone for display
            const originalUpdateTime = new Date(latest.timestamp);
            // Use timezoneAdjustment to convert from server timezone to selected timezone
            const displayTime = new Date(originalUpdateTime.getTime() + timezoneAdjustment * 60000);
            
            const now = new Date();
            const diffSeconds = Math.floor((now - originalUpdateTime) / 1000);
            const statusEl = document.getElementById('liveStatus');
            if (diffSeconds < (window.systemConfig && window.systemConfig.offlineTimeout || 60)) { 
                statusEl.innerHTML = 'онлайн'; 
                statusEl.style.background = '#10b981'; 
            }
            else { 
                statusEl.innerHTML = `${Math.floor(diffSeconds / 60)} мин назад`; 
                statusEl.style.background = '#ef4444'; 
            }
            
            const timeEl = document.getElementById('liveUpdateTime');
            timeEl.style.display = 'block';
            timeEl.innerHTML = displayTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
            document.getElementById('currentSensorName').innerHTML = `${escapeHtml(deviceName)} (нет данных)`;
            document.getElementById('tempVal').innerHTML = '--'; 
            document.getElementById('humVal').innerHTML = '--'; 
            document.getElementById('pressVal').innerHTML = '--';
            document.getElementById('liveStatus').innerHTML = 'нет данных'; 
            document.getElementById('liveStatus').style.background = '#64748b';
            document.getElementById('liveUpdateTime').style.display = 'none';
            document.getElementById('sensorMetrics').style.display = 'none';
            document.getElementById('metricType').innerHTML = '';
        }
    } catch (error) { console.error('Ошибка загрузки данных:', error); }
}

// Функции для редактирования датчиков на странице
async function saveSensorName(deviceName, newDisplayName) {
    if (!newDisplayName || !newDisplayName.trim()) {
        return false;
    }

    try {
        const response = await fetch('/api/admin/rename/device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                device_name: deviceName,
                display_name: newDisplayName.trim()
            })
        });

        if (response.ok) {
            console.log(`✅ Датчик переименован: "${deviceName}" → "${newDisplayName}"`);
            await loadDevices();
            await loadGridData();
            // Если открыта деталь датчика - обновляем и её
            if (currentDevice === deviceName) {
                await loadLatestData(deviceName);
            }
            return true;
        } else {
            const error = await response.json();
            console.error(`Ошибка переименования: ${error.error || 'Неизвестная ошибка'}`);
            return false;
        }
    } catch (error) {
        console.error('Ошибка подключения к серверу');
        console.error(error);
        return false;
    }
}

function startEditSensor(deviceName, nameElement, oldDisplayName) {
    if (!isAdmin) return;

    // Предотвращаем срабатывание других обработчиков
    event.stopPropagation();

    // Создаем input для редактирования
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldDisplayName;
    input.style.width = '100%';
    input.style.padding = '4px 8px';
    input.style.fontSize = '14px';
    input.style.border = '2px solid #3b82f6';
    input.style.borderRadius = '4px';
    input.style.fontWeight = 'bold';

    // Заменяем текст на input
    nameElement.innerHTML = '';
    nameElement.appendChild(input);
    input.focus();
    input.select();

    // Обработчик сохранения на Enter
    input.onkeydown = async (e) => {
        if (e.key === 'Enter') {
            const newName = input.value;
            if (newName !== oldDisplayName) {
                const success = await saveSensorName(deviceName, newName);
                if (success) {
                    nameElement.innerHTML = escapeHtml(newName);
                } else {
                    nameElement.innerHTML = escapeHtml(oldDisplayName);
                }
            } else {
                nameElement.innerHTML = escapeHtml(oldDisplayName);
            }
        } else if (e.key === 'Escape') {
            nameElement.innerHTML = escapeHtml(oldDisplayName);
        }
    };

    // Обработчик потери фокуса - отмена редактирования
    input.onblur = () => {
        nameElement.innerHTML = escapeHtml(oldDisplayName);
    };
}

function startEditDetailSensorName(deviceName, oldDisplayName, nameElement) {
    if (!isAdmin) return;

    // Создаем input для редактирования
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldDisplayName;
    input.style.width = '100%';
    input.style.padding = '8px 12px';
    input.style.fontSize = '18px';
    input.style.border = '2px solid #3b82f6';
    input.style.borderRadius = '4px';
    input.style.fontWeight = 'bold';

    // Заменяем текст на input
    nameElement.innerHTML = '';
    nameElement.appendChild(input);
    input.focus();
    input.select();

    // Обработчик сохранения на Enter
    input.onkeydown = async (e) => {
        if (e.key === 'Enter') {
            const newName = input.value;
            if (newName !== oldDisplayName) {
                const success = await saveSensorName(deviceName, newName);
                if (success) {
                    nameElement.innerHTML = `📌 ${escapeHtml(newName)}`;
                } else {
                    nameElement.innerHTML = `📌 ${escapeHtml(oldDisplayName)}`;
                }
            } else {
                nameElement.innerHTML = `📌 ${escapeHtml(oldDisplayName)}`;
            }
        } else if (e.key === 'Escape') {
            nameElement.innerHTML = `📌 ${escapeHtml(oldDisplayName)}`;
        }
    };

    // Обработчик потери фокуса - отмена редактирования
    input.onblur = () => {
        nameElement.innerHTML = `📌 ${escapeHtml(oldDisplayName)}`;
    };
}

// ===== ADMIN AUTHENTICATION FUNCTIONS =====

async function adminLogin() {
    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;
    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (response.ok) {
            isAdmin = true;
            if (document.getElementById('loginForm')) {
                document.getElementById('loginForm').style.display = 'none';
            }
            if (document.getElementById('adminTools')) {
                document.getElementById('adminTools').style.display = 'block';
            }
            await loadDevices();
            if (typeof loadStatistics === 'function') {
                await loadStatistics();
            }
            console.log('✅ Вход выполнен успешно!');
            await updateNavbarButtons();
        } else {
            console.error('❌ Неверный логин или пароль');
        }
    } catch (error) {
        console.error('❌ Ошибка подключения к серверу');
    }
}

async function adminLogout() {
    try {
        const response = await fetch('/api/admin/logout', {
            method: 'POST'
        });
        isAdmin = false;

        // Проверяем, находимся ли мы на странице администратора
        if (document.getElementById('adminTools')) {
            if (document.getElementById('loginForm')) {
                document.getElementById('loginForm').style.display = 'flex';
            }
            if (document.getElementById('adminTools')) {
                document.getElementById('adminTools').style.display = 'none';
            }
            if (document.getElementById('adminUsername')) {
                document.getElementById('adminUsername').value = '';
            }
            if (document.getElementById('adminPassword')) {
                document.getElementById('adminPassword').value = '';
            }
            console.log('✅ Выход выполнен');
        } else {
            // Находимся на главной странице, перезагружаем
            await updateNavbarButtons();
            window.location.reload();
        }
    } catch (error) {
        console.error('Ошибка при выходе:', error);
    }
}
