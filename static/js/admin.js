// Админ функции

async function checkAdminStatus() {
    try {
        const response = await fetch('/api/admin/check');
        const data = await response.json();
        isAdmin = data.authenticated;
        if (isAdmin) {
            document.getElementById('loginForm').style.display = 'none';
            document.getElementById('adminTools').style.display = 'block';
            await loadDevices();
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
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('adminTools').style.display = 'none';
        document.getElementById('adminPanel').classList.remove('open');
        document.getElementById('adminOverlay').classList.remove('open');
        alert('Выход выполнен');
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
                await loadGridData();
                if (currentDevice === device) showGridView();
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
                await loadGridData();
                if (currentDevice && (device === currentDevice || !device)) {
                    loadLatestData(currentDevice);
                    loadChartData(currentDevice);
                }
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
                await loadGridData();
                showGridView();
            }
        } catch (error) {
            console.error(error);
        }
    }
}

function openAdminPanel() {
    document.getElementById('adminPanel').classList.add('open');
    document.getElementById('adminOverlay').classList.add('open');
    checkAdminStatus();
}

function closeAdminPanel() {
    document.getElementById('adminPanel').classList.remove('open');
    document.getElementById('adminOverlay').classList.remove('open');
}
