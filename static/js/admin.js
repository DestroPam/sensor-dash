// Админ функции для отдельной страницы администратора

// Проверка, находимся ли мы на странице администратора
const isAdminPage = window.location.pathname === '/admin';
let isAdmin = false;

function updateAdminDeviceLists(deviceNames) {
    const select = document.getElementById('adminDeviceSelect');
    if (select) {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Все датчики</option>';
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
                document.getElementById('adminSidebar').style.display = 'none';
            } else {
                // Показываем админ-инструменты
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
            document.getElementById('adminTools').style.display = 'flex';
            document.getElementById('adminSidebar').style.display = 'flex';
            await loadDevices();
            await loadStatistics();
            console.log('✅ Вход выполнен успешно!');
        } else {
            console.error('❌ Неверный логин или пароль');
        }
    } catch (error) {
        console.error('❌ Ошибка подключения к серверу');
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
            document.getElementById('adminSidebar').style.display = 'none';
            document.getElementById('adminUsername').value = '';
            document.getElementById('adminPassword').value = '';
            console.log('✅ Выход выполнен');
        } else {
            window.location.reload();
        }
    } catch (error) {
        console.error(error);
    }
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
            startDateInput.value = '';
            endDateInput.value = '';
            await loadDevices();
            await loadStatistics();
        } else {
            const error = await response.json();
            messageEl.textContent = error.error || 'Ошибка удаления';
            messageEl.className = 'admin-message error';
        }
    } catch (error) {
        messageEl.textContent = 'Ошибка подключения';
        messageEl.className = 'admin-message error';
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

async function adminDeleteAll() {
    const messageEl = document.getElementById('deleteAllMessage');
    if (!confirm('Вы уверены? Это действие необратимо!')) {
        return;
    }
    try {
        const response = await fetch('/api/admin/delete/all', {
            method: 'DELETE'
        });
        if (response.ok) {
            const result = await response.json();
            messageEl.textContent = `Удалено ${result.deleted_count} записей`;
            messageEl.className = 'admin-message success';
            await loadDevices();
            await loadStatistics();
        } else {
            const error = await response.json();
            messageEl.textContent = error.error || 'Ошибка удаления';
            messageEl.className = 'admin-message error';
        }
    } catch (error) {
        messageEl.textContent = 'Ошибка подключения';
        messageEl.className = 'admin-message error';
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

async function adminExportData() {
    const btn = document.getElementById('adminExportBtn');
    btn.classList.add('loading');
    btn.textContent = 'Экспорт...';

    try {
        const response = await fetch('/api/admin/export');
        if (!response.ok) {
            console.error('❌ Ошибка экспорта');
            btn.classList.remove('loading');
            btn.textContent = '📤 Экспортировать JSON';
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
        btn.textContent = '📤 Экспортировать JSON';
        console.log('✅ Экспорт завершён:', data.sensor_data.length, 'записей,', data.aliases.length, 'имён');
    } catch (error) {
        btn.classList.remove('loading');
        btn.textContent = '📤 Экспортировать JSON';
        console.error('❌ Ошибка экспорта:', error);
    }
}

async function adminImportData() {
    const fileInput = document.getElementById('adminImportFile');
    const file = fileInput.files[0];
    const btn = document.getElementById('adminImportBtn');

    if (!file) {
        console.error('❌ Выберите файл');
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
            console.log(`✅ Импорт завершён: ${result.imported_data} записей, ${result.imported_aliases} имён`);
            fileInput.value = '';
            btn.classList.remove('loading');
            btn.textContent = '📥 Импортировать JSON';
            await loadDevices();
            await loadStatistics();
        } else {
            const error = await response.json();
            btn.classList.remove('loading');
            btn.textContent = '📥 Импортировать JSON';
            console.error(`❌ Ошибка импорта: ${error.error || 'Неизвестная ошибка'}`);
        }
    } catch (error) {
        btn.classList.remove('loading');
        btn.textContent = '📥 Импортировать JSON';
        console.error('❌ Ошибка чтения файла:', error);
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
        return;
    }

    if (newPassword !== confirmNewPassword) {
        messageEl.textContent = 'Новые пароли не совпадают';
        messageEl.className = 'admin-message error';
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
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmNewPassword').value = '';
        } else {
            const error = await response.json();
            messageEl.textContent = error.error || 'Ошибка смены пароля';
            messageEl.className = 'admin-message error';
        }
    } catch (error) {
        messageEl.textContent = 'Ошибка подключения к серверу';
        messageEl.className = 'admin-message error';
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
        const adminDeleteDataBtn = document.getElementById('adminDeleteDataBtn');
        const adminDeleteAllBtn = document.getElementById('adminDeleteAllBtn');
        const adminExportBtn = document.getElementById('adminExportBtn');
        const adminImportBtn = document.getElementById('adminImportBtn');
        const adminChangePasswordBtn = document.getElementById('adminChangePasswordBtn');

        if (navBackBtn) navBackBtn.onclick = () => window.history.back();
        if (navLogoutBtn) navLogoutBtn.onclick = adminLogout;
        if (adminLoginBtn) adminLoginBtn.onclick = adminLogin;
        if (adminDeleteDataBtn) adminDeleteDataBtn.onclick = adminDeleteData;

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
        if (adminChangePasswordBtn) adminChangePasswordBtn.onclick = adminChangePassword;

        // Обновление статистики каждые 10 секунд
        setInterval(async () => {
            await loadDevices();
            await loadStatistics();
        }, 10000);

        // Позволяем нажать Enter в полях ввода
        document.getElementById('adminUsername').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') adminLogin();
        });
        document.getElementById('adminPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') adminLogin();
        });
        document.getElementById('confirmNewPassword').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') adminChangePassword();
        });

        // Sidebar menu navigation
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
