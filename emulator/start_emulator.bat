@echo off
chcp 65001 >nul
title Sensor Emulator
echo ========================================
echo    ЗАПУСК ЭМУЛЯТОРА ДАТЧИКОВ
echo ========================================
echo.

:: Проверка наличия venv
if not exist ".venv" (
    echo [ОШИБКА] Виртуальное окружение не найдено!
    echo Запустите setup_venv.bat для настройки
    pause
    exit /b 1
)

:: Проверка наличия emulator.py
if not exist "emulator.py" (
    echo [ОШИБКА] Файл emulator.py не найден!
    pause
    exit /b 1
)

echo Активация виртуального окружения...
call .venv\Scripts\activate.bat

echo.
echo Выберите режим запуска:
echo.
echo [1] Стандартный (2 датчика, интервал 5 сек)
echo [2] Легкий (1 датчик, интервал 10 сек)
echo [3] Средний (5 датчиков, интервал 5 сек)
echo [4] Нагрузочный (10 датчиков, интервал 2 сек)
echo [5] Пользовательские настройки
echo [6] Показать справку
echo.
echo Примечание: датчики будут иметь разные наборы метрик
echo (полные, без давления, без влажности, только температура и т.д.)
echo.
set /p mode="Выберите (1-6): "

if "%mode%"=="1" (
    set SENSORS=2
    set INTERVAL=5
    set URL=http://localhost:5000
    goto :run
)
if "%mode%"=="2" (
    set SENSORS=1
    set INTERVAL=10
    set URL=http://localhost:5000
    goto :run
)
if "%mode%"=="3" (
    set SENSORS=5
    set INTERVAL=5
    set URL=http://localhost:5000
    goto :run
)
if "%mode%"=="4" (
    set SENSORS=10
    set INTERVAL=2
    set URL=http://localhost:5000
    goto :run
)
if "%mode%"=="5" goto :custom
if "%mode%"=="6" (
    python emulator.py --help
    pause
    exit /b 0
)

echo Неверный выбор!
pause
exit /b 1

:custom
echo.
echo Введите параметры:
set /p SENSORS="Количество датчиков (1-50): "
set /p INTERVAL="Интервал в секундах (1-60): "
set /p URL="URL сервера (Enter для localhost:5000): "
if "%URL%"=="" set URL=http://localhost:5000

:run
echo.
echo ========================================
echo    ЗАПУСК ЭМУЛЯТОРА
echo ========================================
echo Датчиков: %SENSORS%
echo Интервал: %INTERVAL% сек
echo Сервер: %URL%
echo ========================================
echo.
echo [ИНФО] Датчики с разными наборами метрик (T, H, P)
echo [ИНФО] Для остановки нажмите Ctrl+C
echo.

python emulator.py %SENSORS% %INTERVAL% %URL%

pause