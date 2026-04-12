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

function showGridView() {
    viewMode = 'grid';
    stopLiveChartUpdates();
    document.getElementById('gridView').style.display = 'block';
    document.getElementById('detailView').style.display = 'none';
    currentDevice = null;
    loadGridData();
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
}

function startAutoUpdate() {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(async () => {
        if (!isDragging) {
            await loadDevices();
            if (viewMode === 'grid') await loadGridData();
            else if (currentDevice && !isLiveMode) await loadLatestData(currentDevice);
        }
    }, 3000);
}

// События кнопок
function setupEventListeners() {
    document.getElementById('backToGridBtn').onclick = () => {
        stopLiveChartUpdates();
        showGridView();
    };
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
    document.getElementById('openAdminBtn').onclick = openAdminPanel;
    document.getElementById('closeAdminBtn').onclick = closeAdminPanel;
    document.getElementById('adminOverlay').onclick = closeAdminPanel;
    document.getElementById('adminLoginBtn').onclick = adminLogin;
    document.getElementById('adminLogoutBtn').onclick = adminLogout;
    document.getElementById('adminDeleteDeviceBtn').onclick = adminDeleteDevice;
    document.getElementById('adminDeleteRangeBtn').onclick = adminDeleteRange;
    document.getElementById('adminDeleteAllBtn').onclick = adminDeleteAll;
}

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    toggleCustomDateRange();
    loadDeviceOrder().then(() => {
        loadDevices();
        loadGridData();
        startAutoUpdate();
    });
});
