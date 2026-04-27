// Основная логика приложения

const API_BASE = '';
let currentDevice = null;
let chartInstance = null;
let updateInterval = null;
let liveChartInterval = null;
let isAdmin = false;
let viewMode = 'grid';
let currentMetric = 'temperature';
let isLiveMode = false;
let draggedElement = null;
let listDeviceOrder = [];
let gridDeviceOrder = [];
let isDragging = false;

async function updateNavbarButtons() {
    try {
        const response = await fetch('/api/admin/check');
        const data = await response.json();
        isAdmin = data.authenticated;
        
        const navLoginBtn = document.getElementById('navLoginBtn');
        const navAdminBtn = document.getElementById('navAdminBtn');
        const navLogoutBtn = document.getElementById('navLogoutBtn');
        
        if (isAdmin) {
            navLoginBtn.style.display = 'none';
            navAdminBtn.style.display = 'inline-block';
            navLogoutBtn.style.display = 'inline-block';
        } else {
            navLoginBtn.style.display = 'inline-block';
            navAdminBtn.style.display = 'none';
            navLogoutBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Ошибка проверки статуса админа:', error);
    }
}

function showGridView() {
    viewMode = 'grid';
    stopLiveChartUpdates();
    document.getElementById('gridView').style.display = 'block';
    document.getElementById('detailView').style.display = 'none';
    currentDevice = null;
    loadGridData();
    updateMobileBackButton();
}

function showDetailView(deviceName) {
    viewMode = 'detail';
    currentDevice = deviceName;
    document.getElementById('gridView').style.display = 'none';
    document.getElementById('detailView').style.display = 'block';
    highlightSelectedSensor(deviceName);
    loadLatestData(deviceName);
    checkAndStartLiveMode();
    loadChartData(deviceName);
    updateMobileBackButton();
}

function updateMobileBackButton() {
    const mobileBackBtn = document.getElementById('mobileBackToGridBtn');
    if (!mobileBackBtn) return;

    const isMobile = window.innerWidth <= 576;
    if (isMobile && viewMode === 'detail') {
        mobileBackBtn.style.display = 'block';
    } else {
        mobileBackBtn.style.display = 'none';
    }
}

function startAutoUpdate() {
    if (updateInterval) clearInterval(updateInterval);
    console.log('Запуск интервала автообновления (каждые 3 секунды)');
    
    // Первое обновление нужно сделать сразу
    (async () => {
        console.log('📍 Первое обновление...');
        try {
            await updateNavbarButtons();
            await loadDevices();
            if (viewMode === 'grid') {
                await loadGridData();
            } else if (currentDevice && !isLiveMode) {
                await loadLatestData(currentDevice);
            }
            console.log('✅ Первое обновление завершено');
        } catch (error) {
            console.error('❌ Ошибка первого обновления:', error);
        }
    })();
    
    // Затем настраиваем интервал для повторных обновлений
    updateInterval = setInterval(async () => {
        if (!isDragging) {
            try {
                await updateNavbarButtons();
                await loadDevices();
                if (viewMode === 'grid') {
                    await loadGridData();
                } else if (currentDevice && !isLiveMode) {
                    await loadLatestData(currentDevice);
                }
                console.log('🔄 Автообновление завершено');
            } catch (error) {
                console.error('❌ Ошибка автообновления:', error);
            }
        }
    }, 3000);
}

// События кнопок
function setupEventListeners() {
    document.getElementById('backToGridBtn').onclick = () => {
        stopLiveChartUpdates();
        showGridView();
    };

    // Mobile-only back button in detail view
    const mobileBackBtn = document.getElementById('mobileBackToGridBtn');
    if (mobileBackBtn) {
        mobileBackBtn.addEventListener('click', (e) => {
            e.preventDefault();
            stopLiveChartUpdates();
            showGridView();
        });
        console.log('✅ Mobile back button handler attached');
    } else {
        console.warn('⚠️ Mobile back button not found');
    }

    document.getElementById('refreshChartBtn').onclick = () => {
        if (currentDevice) loadChartData(currentDevice);
    };
    document.getElementById('refreshSensorsBtn').onclick = () => {
        loadDevices();
        loadGridData();
    };
    document.getElementById('metricType').onchange = () => {
        if (currentDevice) loadChartData(currentDevice);
    };
    document.getElementById('periodPreset').onchange = toggleCustomDateRange;
    document.getElementById('applyCustomRange').onclick = () => {
        if (currentDevice) {
            stopLiveChartUpdates();
            loadChartData(currentDevice);
        }
    };
    
    // Navbar buttons
    document.getElementById('navLoginBtn').onclick = () => {
        window.location.href = '/admin';
    };
    document.getElementById('navAdminBtn').onclick = () => {
        window.location.href = '/admin';
    };
    document.getElementById('navLogoutBtn').onclick = adminLogout;
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Инициализация приложения');
    
    try {
        setupEventListeners();
        console.log('✅ Обработчики событий установлены');
    } catch (error) {
        console.error('❌ Ошибка установки обработчиков:', error);
    }
    
    try {
        toggleCustomDateRange();
        console.log('✅ Переключение диапазона дат готово');
    } catch (error) {
        console.error('❌ Ошибка переключения диапазона:', error);
    }
    
    try {
        await updateNavbarButtons();
        console.log('✅ Статус админа проверен');
    } catch (error) {
        console.error('❌ Ошибка проверки статуса админа:', error);
    }
    
    // Загружаем порядок датчиков, но продолжаем даже если ошибка
    try {
        await loadDeviceOrder();
        console.log('✅ Порядок датчиков загружен');
    } catch (error) {
        console.error('❌ Ошибка загрузки порядка датчиков (продолжаем):', error);
    }
    
    // Загружаем системные настройки
    try {
        await loadSystemConfig();
        console.log('✅ Системные настройки загружены');
    } catch (error) {
        console.error('❌ Ошибка загрузки системных настроек (продолжаем):', error);
    }
    
    // Загружаем данные с таймаутом
    try {
        const devicesPromise = loadDevices();
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout loading devices')), 5000));
        await Promise.race([devicesPromise, timeout]);
        console.log('✅ Список датчиков загружен');
    } catch (error) {
        console.error('❌ Ошибка загрузки датчиков (продолжаем):', error);
    }
    
    try {
        const gridPromise = loadGridData();
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout loading grid')), 5000));
        await Promise.race([gridPromise, timeout]);
        console.log('✅ Сетка датчиков отрисована');
    } catch (error) {
        console.error('❌ Ошибка отрисовки сетки (продолжаем):', error);
    }
    
    // Запускаем автообновление ВСЕ РАВНО, даже если была ошибка
    startAutoUpdate();
    console.log('✅ Приложение готово к работе');

    // Update mobile back button on resize
    window.addEventListener('resize', updateMobileBackButton);
});

// Обработчик для кнопки "Назад" в браузере - перезагружаем настройки при возврате на страницу
window.addEventListener('pageshow', async (event) => {
    // event.persisted = true означает, что страница загружена из кеша (back/forward navigation)
    if (event.persisted) {
        console.log('📄 Страница загружена из кеша (кнопка Назад/Вперед) - обновляем настройки');
        try {
            await loadSystemConfig();
            console.log('✅ Настройки перезагружены после возврата на страницу');
            
            // Перезагружаем данные чтобы применить новые настройки
            if (viewMode === 'grid') {
                await loadGridData();
            } else if (currentDevice) {
                await loadLatestData(currentDevice);
                await loadChartData(currentDevice);
            }
        } catch (error) {
            console.error('❌ Ошибка перезагрузки настроек:', error);
        }
    }
});
