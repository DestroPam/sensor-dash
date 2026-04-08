@echo off
chcp 65001 >nul
title Flask Sensor Server
echo ========================================
echo    ЗАПУСК СЕРВЕРА ДАТЧИКОВ
echo ========================================
echo.

:: Проверка наличия venv
if not exist ".venv" (
    echo [ОШИБКА] Виртуальное окружение не найдено!
    echo Запустите setup_venv.bat для настройки
    pause
    exit /b 1
)

:: Проверка наличия необходимых файлов
if not exist "app.py" (
    echo [ОШИБКА] Файл app.py не найден!
    pause
    exit /b 1
)

if not exist "config.py" (
    echo [ПРЕДУПРЕЖДЕНИЕ] Файл config.py не найден
)

if not exist "models.py" (
    echo [ПРЕДУПРЕЖДЕНИЕ] Файл models.py не найден
)

echo Активация виртуального окружения...
call .venv\Scripts\activate.bat

echo.
echo [ЗАПУСК] Сервер запускается на http://localhost:5000
echo [ИНФО] Для остановки нажмите Ctrl+C
echo [ИНФО] База данных будет создана автоматически
echo.

:: Запуск сервера
python app.py

pause