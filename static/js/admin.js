// ===== ADMIN PAGE JAVASCRIPT =====

const isAdminPage = window.location.pathname === '/admin';
let isAdmin = false;
let systemSettings = {};

// ===== SYSTEM SETTINGS =====

async function loadSettings() {
    try {
        const response = await fetch('/api/admin/settings');
        if (response.ok) {
            const data = await response.json();
            systemSettings = data;
            applySettingsToUI();
            applySettingsGlobally();
        }
    } catch (error) {
        console.error('Ошибка загрузки настроек:', error);
    }
}

function applySettingsToUI() {
    const tempUnitSelect = document.getElementById('tempUnitSetting');
    if (tempUnitSelect && systemSettings.temperature_unit) {
        tempUnitSelect.value = systemSettings.temperature_unit;
    }

    const pressUnitSelect = document.getElementById('pressUnitSetting');
    if (pressUnitSelect && systemSettings.pressure_unit) {
        pressUnitSelect.value = systemSettings.pressure_unit;
    }

    const timezoneSelect = document.getElementById('timezoneSetting');
    if (timezoneSelect && systemSettings.timezone) {
        timezoneSelect.value = systemSettings.timezone;
    }

    const offlineTimeoutInput = document.getElementById('offlineTimeoutSetting');
    if (offlineTimeoutInput && systemSettings.offline_timeout) {
        offlineTimeoutInput.value = systemSettings.offline_timeout;
    }
}

async function saveSettings() {
    const settings = {
        temperature_unit: document.getElementById('tempUnitSetting').value,
        pressure_unit: document.getElementById('pressUnitSetting').value,
        timezone: document.getElementById('timezoneSetting').value,
        offline_timeout: document.getElementById('offlineTimeoutSetting').value
    };

    const msgEl = document.getElementById('settingsMessage');
    
    try {
        const response = await fetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        
        if (response.ok) {
            msgEl.textContent = 'Настройки сохранены';
            msgEl.className = 'admin-message success';
            msgEl.style.display = 'block';
            systemSettings = { ...systemSettings, ...settings };
            applySettingsGlobally();
        } else {
            msgEl.textContent = ' Ошибка сохранения';
            msgEl.className = 'admin-message error';
            msgEl.style.display = 'block';
        }
    } catch (error) {
        msgEl.textContent = ' Ошибка подключения';
        msgEl.className = 'admin-message error';
        msgEl.style.display = 'block';
    }

    setTimeout(() => {
        if (msgEl) {
            msgEl.style.display = 'none';
            msgEl.textContent = '';
            msgEl.className = 'admin-message';
        }
    }, 3000);
}

function applySettingsGlobally() {
    window.systemConfig = window.systemConfig || {};
    window.systemConfig.offlineTimeout = parseInt(systemSettings.offline_timeout || '60');
    window.systemConfig.timezone = systemSettings.timezone || 'UTC+4';
    window.systemConfig.tempUnit = systemSettings.temperature_unit || 'celsius';
    window.systemConfig.pressureUnit = systemSettings.pressure_unit || 'hpa';
}

// ===== DEVICE MANAGEMENT =====

async function loadDevices() {
    try {
        const response = await fetch('/api/devices');
        const devicesData = await response.json();
        const deviceNames = devicesData.map(d => typeof d === 'string' ? d : d.device_name);
        if (typeof updateAdminDeviceLists === 'function') {
            updateAdminDeviceLists(deviceNames);
        }
    } catch (error) {
        console.error('Ошибка загрузки устройств:', error);
    }
}

async function loadStatistics() {
    try {
        const devicesResponse = await fetch('/api/devices');
        const devicesData = await devicesResponse.json();
        const countResponse = await fetch('/api/data/count');
        const countData = await countResponse.json();

        const activeSensorsEl = document.getElementById('activeSensorsCount');
        const totalRecordsEl = document.getElementById('totalRecordsCount');

        if (activeSensorsEl) activeSensorsEl.textContent = devicesData.length;
        if (totalRecordsEl) totalRecordsEl.textContent = countData.count;
    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

async function loadDeviceDateRange(deviceName) {
    if (!deviceName) return null;
    try {
        const response = await fetch(`/api/data/device/${encodeURIComponent(deviceName)}?sort=asc&limit=1`);
        const ascData = await response.json();
        const responseDesc = await fetch(`/api/data/device/${encodeURIComponent(deviceName)}?sort=desc&limit=1`);
        const descData = await responseDesc.json();
        if (ascData.length > 0 && descData.length > 0) {
            const start = new Date(ascData[0].timestamp);
            const end = new Date(descData[0].timestamp);
            const toLocalDatetime = (date) => {
                const offset = date.getTimezoneOffset();
                const local = new Date(date.getTime() - offset * 60000);
                return local.toISOString().slice(0, 16);
            };
            return { start: toLocalDatetime(start), end: toLocalDatetime(end) };
        }
    } catch (error) {
        console.error('Ошибка загрузки периода:', error);
    }
    return null;
}

// ===== ADMIN ACTIONS =====

async function adminLogin() {
    const username = document.getElementById('adminUsername').value;
    const password = document.getElementById('adminPassword').value;
    const errorDiv = document.getElementById('loginError');
    errorDiv.style.display = 'none';
    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (response.ok) {
            isAdmin = true;
            errorDiv.style.display = 'none';
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('adminTools').style.display = 'flex';
            document.getElementById('adminSidebar').style.display = 'flex';
            await loadDevices();
            await loadStatistics();
            await loadSettings();
            console.log('Вход выполнен успешно!');
        } else {
            errorDiv.textContent = 'Неверный логин или пароль';
            errorDiv.style.display = 'block';
            console.error('Неверный логин или пароль');
        }
    } catch (error) {
        console.error('Ошибка подключения к серверу');
    }
}

async function adminLogout() {
    try {
        await fetch('/api/admin/logout', { method: 'POST' });
        isAdmin = false;
        if (isAdminPage) {
            document.getElementById('loginForm').style.display = 'flex';
            document.getElementById('adminTools').style.display = 'none';
            document.getElementById('adminSidebar').style.display = 'none';
            document.getElementById('adminUsername').value = '';
            document.getElementById('adminPassword').value = '';
            console.log('Выход выполнен');
        } else {
            window.location.reload();
        }
    } catch (error) {
        console.error(error);
    }
}

async function adminChangePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;
    const messageEl = document.getElementById('passwordChangeMessage');

    if (!currentPassword || !newPassword || !confirmNewPassword) {
        messageEl.textContent = 'Заполните все поля';
        messageEl.className = 'admin-message error';
        messageEl.style.display = 'block';
        return;
    }

    if (newPassword !== confirmNewPassword) {
        messageEl.textContent = 'Новые пароли не совпадают';
        messageEl.className = 'admin-message error';
        messageEl.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/admin/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
        });

        if (response.ok) {
            messageEl.textContent = 'Пароль успешно изменён';
            messageEl.className = 'admin-message success';
            messageEl.style.display = 'block';
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmNewPassword').value = '';
        } else {
            const error = await response.json();
            messageEl.textContent = error.error || 'Ошибка смены пароля';
            messageEl.className = 'admin-message error';
            messageEl.style.display = 'block';
        }
    } catch (error) {
        messageEl.textContent = 'Ошибка подключения к серверу';
        messageEl.className = 'admin-message error';
        messageEl.style.display = 'block';
    }

    setTimeout(() => {
        if (messageEl) {
            messageEl.style.display = 'none';
            messageEl.textContent = '';
            messageEl.className = 'admin-message';
        }
    }, 3000);
}

async function adminDeleteData() {
    const device = document.getElementById('adminDeviceSelect').value;
    const startDateInput = document.getElementById('adminStartDate');
    const endDateInput = document.getElementById('adminEndDate');
    const startDate = startDateInput.value;
    const endDate = endDateInput.value;
    const messageEl = document.getElementById('deleteDataMessage');

    if (!device && (!startDate || !endDate)) {
        messageEl.textContent = 'Выберите датчик или период';
        messageEl.className = 'admin-message error';
        messageEl.style.display = 'block';
        return;
    }

    let confirmMsg = '';
    if (device && startDate && endDate) {
        confirmMsg = `Удалить данные датчика "${device}" за период?`;
    } else if (device) {
        confirmMsg = `Удалить все данные датчика "${device}"?`;
    } else if (startDate && endDate) {
        confirmMsg = 'Удалить данные за выбранный период?';
    }

    if (!confirm(confirmMsg)) return;

    try {
        const response = await fetch('/api/admin/delete/range', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start_date: startDate || null,
                end_date: endDate || null,
                device_name: device || null
            })
        });
        if (response.ok) {
            const result = await response.json();
            messageEl.textContent = `Удалено ${result.deleted_count} записей`;
            messageEl.className = 'admin-message success';
            messageEl.style.display = 'block';
            startDateInput.value = '';
            endDateInput.value = '';
            await loadDevices();
            await loadStatistics();
        } else {
            const error = await response.json();
            messageEl.textContent = error.error || 'Ошибка удаления';
            messageEl.className = 'admin-message error';
            messageEl.style.display = 'block';
        }
    } catch (error) {
        messageEl.textContent = 'Ошибка подключения';
        messageEl.className = 'admin-message error';
        messageEl.style.display = 'block';
    }
}

async function adminDeleteAll() {
    const messageEl = document.getElementById('deleteAllMessage');
    if (!confirm('Вы уверены? Это действие необратимо!')) {
        return;
    }
    try {
        const response = await fetch('/api/admin/delete/all', { method: 'DELETE' });
        if (response.ok) {
            const result = await response.json();
            messageEl.textContent = `Удалено ${result.deleted_count} записей`;
            messageEl.className = 'admin-message success';
            messageEl.style.display = 'block';
            await loadDevices();
            await loadStatistics();
        } else {
            const error = await response.json();
            messageEl.textContent = error.error || 'Ошибка удаления';
            messageEl.className = 'admin-message error';
            messageEl.style.display = 'block';
        }
    } catch (error) {
        messageEl.textContent = 'Ошибка подключения';
        messageEl.className = 'admin-message error';
        messageEl.style.display = 'block';
    }
}

async function adminExportData() {
    const btn = document.getElementById('adminExportBtn');
    btn.classList.add('loading');
    btn.textContent = 'Экспорт...';

    try {
        const response = await fetch('/api/admin/export');
        if (!response.ok) {
            console.error('Ошибка экспорта');
            btn.classList.remove('loading');
            btn.textContent = 'Экспортировать JSON';
            return;
        }

        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `sensor_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        btn.classList.remove('loading');
        btn.textContent = 'Экспортировать JSON';
        console.log('Экспорт завершён:', data.sensor_data.length, 'записей,', data.aliases.length, 'имён');
    } catch (error) {
        btn.classList.remove('loading');
        btn.textContent = 'Экспортировать JSON';
        console.error('Ошибка экспорта:', error);
    }
}

async function adminImportData() {
    const fileInput = document.getElementById('adminImportFile');
    const file = fileInput.files[0];
    const btn = document.getElementById('adminImportBtn');

    if (!file) {
        console.error('  Выберите файл');
        return;
    }

    btn.classList.add('loading');
    btn.textContent = 'Импорт...';

    try {
        const text = await file.text();
        const data = JSON.parse(text);

        const response = await fetch('/api/admin/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            const result = await response.json();
            console.log(`Импорт завершён: ${result.imported_data} записей, ${result.imported_aliases} имён`);
            fileInput.value = '';
            btn.classList.remove('loading');
            btn.textContent = 'Импортировать JSON';
            await loadDevices();
            await loadStatistics();
        } else {
            const error = await response.json();
            btn.classList.remove('loading');
            btn.textContent = 'Импортировать JSON';
            console.error(`Ошибка импорта: ${error.error || 'Неизвестная ошибка'}`);
        }
    } catch (error) {
        btn.classList.remove('loading');
        btn.textContent = ' Импортировать JSON';
        console.error('Ошибка чтения файла:', error);
    }
}

async function checkAdminStatus() {
    try {
        const response = await fetch('/api/admin/check');
        const data = await response.json();
        isAdmin = data.authenticated;

        if (isAdminPage) {
            if (!isAdmin) {
                document.getElementById('loginForm').style.display = 'flex';
                document.getElementById('adminTools').style.display = 'none';
                document.getElementById('adminSidebar').style.display = 'none';
            } else {
                document.getElementById('loginForm').style.display = 'none';
                document.getElementById('adminTools').style.display = 'flex';
                document.getElementById('adminSidebar').style.display = 'flex';
                await loadDevices();
                await loadStatistics();
            }
        }
    } catch (error) {
        console.error(error);
    }
}

// ===== INITIALIZATION =====

if (isAdminPage) {
    document.addEventListener('DOMContentLoaded', () => {
        checkAdminStatus();

        const navBackBtn = document.getElementById('navBackBtn');
        const navLogoutBtn = document.getElementById('navLogoutBtn');
        const adminLoginBtn = document.getElementById('adminLoginBtn');
        const adminDeleteDataBtn = document.getElementById('adminDeleteDataBtn');
        const adminDeleteAllBtn = document.getElementById('adminDeleteAllBtn');
        const adminExportBtn = document.getElementById('adminExportBtn');
        const adminImportBtn = document.getElementById('adminImportBtn');
        const adminChangePasswordBtn = document.getElementById('adminChangePasswordBtn');
        const adminSaveSettingsBtn = document.getElementById('adminSaveSettingsBtn');

        if (navBackBtn) navBackBtn.onclick = () => window.history.back();
        if (navLogoutBtn) navLogoutBtn.onclick = adminLogout;
        if (adminLoginBtn) adminLoginBtn.onclick = adminLogin;
        if (adminDeleteDataBtn) adminDeleteDataBtn.onclick = adminDeleteData;
        if (adminChangePasswordBtn) adminChangePasswordBtn.onclick = adminChangePassword;
        if (adminSaveSettingsBtn) adminSaveSettingsBtn.onclick = saveSettings;

        const deviceSelect = document.getElementById('adminDeviceSelect');
        if (deviceSelect) {
            deviceSelect.addEventListener('change', async () => {
                const device = deviceSelect.value;
                const startDateInput = document.getElementById('adminStartDate');
                const endDateInput = document.getElementById('adminEndDate');
                if (device) {
                    const range = await loadDeviceDateRange(device);
                    if (range) {
                        startDateInput.value = range.start;
                        endDateInput.value = range.end;
                    }
                } else {
                    startDateInput.value = '';
                    endDateInput.value = '';
                }
            });
        }

        if (adminDeleteAllBtn) adminDeleteAllBtn.onclick = adminDeleteAll;
        if (adminExportBtn) adminExportBtn.onclick = adminExportData;
        if (adminImportBtn) adminImportBtn.onclick = adminImportData;

        loadSettings();

        setInterval(async () => {
            await loadDevices();
            await loadStatistics();
        }, 10000);

        document.getElementById('adminUsername').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') adminLogin();
        });
        document.getElementById('adminPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') adminLogin();
        });
        document.getElementById('confirmNewPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') adminChangePassword();
        });

        document.querySelectorAll('.admin-menu-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target;
                const target = document.getElementById(targetId);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    });
}
