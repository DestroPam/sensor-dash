// Админ функции для отдельной страницы администратора

// Проверка, находимся ли мы на странице администратора
const isAdminPage = window.location.pathname === '/admin';
let isAdmin = false;

function updateAdminDeviceLists(deviceNames) {
    const selects = [
        'adminDeviceSelect',
        'adminRangeDeviceSelect',
        'adminRenameDeviceSelect'
    ];
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            const currentValue = select.value;
            select.innerHTML = '<option value="">Выберите датчик...</option>';
            deviceNames.forEach(device => {
                const option = document.createElement('option');
                option.value = device;
                option.textContent = device;
                select.appendChild(option);
            });
            if (currentValue && deviceNames.includes(currentValue)) {
                select.value = currentValue;
            }
        }
    });
}

async function loadDevices() {
    try {
        const response = await fetch('/api/devices');
        const devicesData = await response.json();
        const deviceNames = devicesData.map(d => typeof d === 'string' ? d : d.device_name);
        updateAdminDeviceLists(deviceNames);
    } catch (error) {
        console.error('Ошибка загрузки устройств:', error);
    }
}

async function checkAdminStatus() {
    try {
        const response = await fetch('/api/admin/check');
        const data = await response.json();
        isAdmin = data.authenticated;
        
        if (isAdminPage) {
            // На странице админ-панели
            if (!isAdmin) {
                // Показываем форму входа
                document.getElementById('loginForm').style.display = 'flex';
                document.getElementById('adminTools').style.display = 'none';
            } else {
                // Показываем админ-инструменты
                document.getElementById('loginForm').style.display = 'none';
                document.getElementById('adminTools').style.display = 'block';
                await loadDevices();
                await loadStatistics();
            }
        }
    } catch (error) {
        console.error(error);
    }
}

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
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('adminTools').style.display = 'block';
            await loadDevices();
            await loadStatistics();
            alert('Вход выполнен успешно!');
        } else {
            alert('Неверный логин или пароль');
        }
    } catch (error) {
        alert('Ошибка подключения к серверу');
    }
}

async function adminLogout() {
    try {
        await fetch('/api/admin/logout', {
            method: 'POST'
        });
        isAdmin = false;
        if (isAdminPage) {
            document.getElementById('loginForm').style.display = 'flex';
            document.getElementById('adminTools').style.display = 'none';
            document.getElementById('adminUsername').value = '';
            document.getElementById('adminPassword').value = '';
            alert('Выход выполнен');
        } else {
            window.location.reload();
        }
    } catch (error) {
        console.error(error);
    }
}

async function adminDeleteDevice() {
    const device = document.getElementById('adminDeviceSelect').value;
    if (!device) {
        alert('Выберите датчик');
        return;
    }
    if (confirm(`Удалить все данные датчика "${device}"?`)) {
        try {
            const response = await fetch(`/api/admin/delete/device/${encodeURIComponent(device)}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                alert('Данные удалены');
                await loadDevices();
                await loadStatistics();
            }
        } catch (error) {
            console.error(error);
        }
    }
}

async function adminDeleteRange() {
    const startDate = document.getElementById('adminStartDate').value;
    const endDate = document.getElementById('adminEndDate').value;
    const device = document.getElementById('adminRangeDeviceSelect').value;
    if (!startDate || !endDate) {
        alert('Выберите период');
        return;
    }
    if (confirm(`Удалить данные за период?`)) {
        try {
            const response = await fetch('/api/admin/delete/range', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ start_date: startDate, end_date: endDate, device_name: device || null })
            });
            if (response.ok) {
                alert('Данные удалены');
                await loadDevices();
                await loadStatistics();
            }
        } catch (error) {
            console.error(error);
        }
    }
}

async function adminDeleteAll() {
    if (confirm('⚠️ Удалить ВСЕ данные?')) {
        try {
            const response = await fetch('/api/admin/delete/all', {
                method: 'DELETE'
            });
            if (response.ok) {
                alert('Все данные удалены');
                await loadDevices();
                await loadStatistics();
            }
        } catch (error) {
            console.error(error);
        }
    }
}

async function adminRenameDevice() {
    const deviceSelect = document.getElementById('adminRenameDeviceSelect');
    const newNameInput = document.getElementById('adminRenameInput');
    const deviceName = deviceSelect.value;
    const displayName = newNameInput.value.trim();
    
    if (!deviceName) {
        alert('Выберите датчик');
        return;
    }
    
    if (!displayName) {
        alert('Введите новое имя');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/rename/device', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                device_name: deviceName,
                display_name: displayName
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            alert(`Датчик переименован: "${deviceName}" → "${displayName}"`);
            newNameInput.value = '';
            await loadDevices();
            await loadStatistics();
        } else {
            const error = await response.json();
            alert(`Ошибка: ${error.error || 'Неизвестная ошибка'}`);
        }
    } catch (error) {
        alert('Ошибка подключения к серверу');
        console.error(error);
    }
}

async function loadStatistics() {
    try {
        // Получаем количество активных датчиков
        const devicesResponse = await fetch('/api/devices');
        const devicesData = await devicesResponse.json();
        
        // Получаем общее количество записей
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

// Инициализация если это страница администратора
if (isAdminPage) {
    document.addEventListener('DOMContentLoaded', () => {
        checkAdminStatus();
        
        // Навигация
        const navBackBtn = document.getElementById('navBackBtn');
        const navLogoutBtn = document.getElementById('navLogoutBtn');
        const adminLoginBtn = document.getElementById('adminLoginBtn');
        const adminDeleteDeviceBtn = document.getElementById('adminDeleteDeviceBtn');
        const adminDeleteRangeBtn = document.getElementById('adminDeleteRangeBtn');
        const adminDeleteAllBtn = document.getElementById('adminDeleteAllBtn');
        const adminRenameBtn = document.getElementById('adminRenameBtn');
        
        if (navBackBtn) navBackBtn.onclick = () => window.history.back();
        if (navLogoutBtn) navLogoutBtn.onclick = adminLogout;
        if (adminLoginBtn) adminLoginBtn.onclick = adminLogin;
        if (adminDeleteDeviceBtn) adminDeleteDeviceBtn.onclick = adminDeleteDevice;
        if (adminDeleteRangeBtn) adminDeleteRangeBtn.onclick = adminDeleteRange;
        if (adminDeleteAllBtn) adminDeleteAllBtn.onclick = adminDeleteAll;
        if (adminRenameBtn) adminRenameBtn.onclick = adminRenameDevice;
        
        // Позволяем нажать Enter в полях ввода
        document.getElementById('adminUsername').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') adminLogin();
        });
        document.getElementById('adminPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') adminLogin();
        });
    });
}
